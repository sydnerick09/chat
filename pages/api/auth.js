import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COOKIE_NAME = "chat_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function validUsername(username) {
  return /^[a-z0-9_-]{3,30}$/.test(username);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

function createSession(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    username: user.username,
    exp: Date.now() + MAX_AGE * 1000,
  })).toString("base64url");

  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readSession(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const token = decodeURIComponent(match[1]);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET || "")
    .update(payload).digest("base64url");

  if (signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.id || !data.username || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}`
  );
}

export default async function handler(req, res) {
  if (req.method === "GET" && req.query.action === "me") {
    const session = readSession(req);
    if (!session) return res.status(200).json({ user: null });

    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id,name,username")
      .eq("id", session.id)
      .maybeSingle();

    if (error || !data) return res.status(200).json({ user: null });
    return res.status(200).json({ user: data });
  }

  if (req.method === "POST") {
    const action = req.query.action || req.body?.action;

    if (action === "logout") {
      res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;`);
      return res.status(200).json({ ok: true });
    }

    if (action !== "signup" && action !== "login") {
      return res.status(400).json({ error: "Invalid authentication action." });
    }

    const { name, password } = req.body || {};
    const username = normalizeUsername(req.body?.username);

    if (!validUsername(username)) {
      return res.status(400).json({
        error: "Username must be 3-30 characters and use only lowercase letters, numbers, underscore, or hyphen.",
      });
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: "Password must be between 8 and 200 characters." });
    }

    if (action === "signup") {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
        return res.status(400).json({ error: "Please enter a valid name." });
      }

      const existing = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (existing.data) return res.status(409).json({ error: "Username already taken. Please choose another username." });
      if (existing.error && existing.error.code !== "PGRST116") {
        return res.status(500).json({ error: existing.error.message });
      }

      const { hash, salt } = hashPassword(password);

      const { data, error } = await supabaseAdmin
        .from("users")
        .insert({ name: name.trim(), username, password_hash: hash, password_salt: salt })
        .select("id,name,username")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Username already taken. Please choose another username." });
        }
        return res.status(500).json({ error: error.message });
      }

      setSessionCookie(res, createSession(data));
      return res.status(201).json({ user: data });
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id,name,username,password_hash,password_salt")
      .eq("username", username)
      .maybeSingle();

    if (error || !data || !verifyPassword(password, data.password_hash, data.password_salt)) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }

    const user = { id: data.id, name: data.name, username: data.username };
    setSessionCookie(res, createSession(user));
    return res.status(200).json({ user });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
