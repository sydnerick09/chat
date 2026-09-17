import Busboy from "busboy";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const config = {
  api: { bodyParser: false, responseLimit: "8mb" },
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function isVideo(filename, mime) {
  return String(mime || "").toLowerCase().startsWith("video/") ||
    /\.(mp4|mov|webm|avi|mkv|mpeg|mpg|3gp|3g2)$/i.test(filename);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server storage is not configured." });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const bb = Busboy({
    headers: req.headers,
    limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 5 },
  });

  let fileBuffer = null;
  let fileName = "";
  let fileType = "";
  let fileTooLarge = false;
  let fields = {};
  let failed = false;

  bb.on("field", (name, value) => { fields[name] = value; });

  bb.on("file", (name, file, info) => {
    fileName = info.filename || "file";
    fileType = info.mimeType || "application/octet-stream";
    const chunks = [];

    if (isVideo(fileName, fileType)) {
      failed = true;
      file.resume();
      return;
    }

    file.on("data", (chunk) => chunks.push(chunk));
    file.on("limit", () => { fileTooLarge = true; });
    file.on("end", () => {
      fileBuffer = Buffer.concat(chunks);
    });
  });

  bb.on("error", () => {
    failed = true;
  });

  bb.on("finish", async () => {
    try {
      if (failed) return res.status(400).json({ error: "Videos are not supported." });
      if (fileTooLarge) return res.status(413).json({ error: "File is too large. Maximum size is 5 MB." });
      if (!fileBuffer || !fileBuffer.length) return res.status(400).json({ error: "No file was uploaded." });
      if (fileBuffer.length > MAX_FILE_SIZE) return res.status(413).json({ error: "File is too large. Maximum size is 5 MB." });

      const username = String(fields.senderUsername || "").toLowerCase();
      const roomId = String(fields.roomId || "");
      if (!/^[a-z0-9_-]{3,30}$/.test(username) || !roomId) {
        return res.status(400).json({ error: "Invalid upload information." });
      }

      const ext = fileName.includes(".") ? "." + fileName.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
      const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
      const path = `${roomId}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeBase || "file"}${ext && !safeBase.toLowerCase().endsWith(ext) ? ext : ""}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("chat-files")
        .upload(path, fileBuffer, {
          contentType: fileType,
          upsert: false,
        });

      if (uploadError) return res.status(500).json({ error: uploadError.message });

      const { data } = supabaseAdmin.storage.from("chat-files").getPublicUrl(path);
      const messageType = fileType.startsWith("image/") ? "image" :
        fileType.startsWith("audio/") ? "audio" : "file";

      return res.status(200).json({
        url: data.publicUrl,
        fileName: fileName,
        fileType,
        fileSize: fileBuffer.length,
        messageType,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Upload failed." });
    }
  });

  req.pipe(bb);
}
