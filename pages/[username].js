import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const VIDEO_TYPES = new Set([
  "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
  "video/x-matroska", "video/mpeg", "video/3gpp", "video/3gpp2"
]);

function getRoomId(a, b) {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("__");
}

export default function UserChat() {
  const router = useRouter();
  const { username: rawUsername } = router.query;
  const targetUsername = typeof rawUsername === "string" ? rawUsername.toLowerCase() : "";
  const [me, setMe] = useState(null);
  const [target, setTarget] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [sending, setSending] = useState(false);
  const [fileSending, setFileSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [showFiles, setShowFiles] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraPreview, setCameraPreview] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const messagesEndRef = useRef(null);

  const roomId = useMemo(() => (
    me && targetUsername ? getRoomId(me.username, targetUsername) : ""
  ), [me, targetUsername]);

  useEffect(() => {
    if (!targetUsername) return;
    if (!/^[a-z0-9_-]+$/.test(targetUsername)) {
      setPageError("Invalid username.");
      setLoading(false);
      return;
    }

    Promise.all([
      fetch("/api/auth?action=me").then((r) => r.json()),
      fetch(`/api/users?username=${encodeURIComponent(targetUsername)}`).then((r) => r.json())
    ])
      .then(([meData, targetData]) => {
        if (!meData.user) {
          setPageError("Please log in or create an account before opening this chat.");
          return;
        }
        if (!targetData.user) {
          setPageError(targetData.error || "Username not found.");
          return;
        }
        setMe(meData.user);
        setTarget(targetData.user);
      })
      .catch(() => setPageError("Could not load this chat."))
      .finally(() => setLoading(false));
  }, [targetUsername]);

  useEffect(() => {
    if (!roomId) return;
    let mounted = true;

    async function load() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (!mounted) return;
      if (error) setPageError(error.message);
      else setMessages(data || []);
    }

    load();

    const channel = supabase
      .channel(`room-${roomId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        setMessages((current) => (
          current.some((m) => m.id === payload.new.id)
            ? current
            : [...current, payload.new]
        ));
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => stopCamera(), []);

  function showNotice(text) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3500);
  }

  async function sendText(e) {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text || sending || !roomId) return;

    setSending(true);
    const { error } = await supabase.from("messages").insert({
      room_id: roomId,
      sender_username: me.username,
      sender_name: me.name,
      message: text,
      message_type: "text",
      reply_to_id: replyTo ? replyTo.id : null,
    });

    if (error) showNotice(`Could not send message: ${error.message}`);
    else {
      setNewMessage("");
      setReplyTo(null);
    }
    setSending(false);
  }

  function validateFile(file) {
    if (!file) return "No file selected.";
    if (file.size > MAX_FILE_SIZE) return "File is too large. Maximum size is 5 MB.";
    if (VIDEO_TYPES.has(file.type) || file.type.startsWith("video/") ||
        /\.(mp4|mov|webm|avi|mkv|mpeg|mpg|3gp|3g2)$/i.test(file.name)) {
      return "Videos are not supported.";
    }
    if (file.size === 0) return "The selected file is empty.";
    return "";
  }

  async function uploadFile(file, typeOverride = null) {
    const validation = validateFile(file);
    if (validation) {
      showNotice(validation);
      return;
    }

    setFileSending(true);
    setShowFiles(false);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("roomId", roomId);
      form.append("senderUsername", me.username);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Upload failed.");

      const { error } = await supabase.from("messages").insert({
        room_id: roomId,
        sender_username: me.username,
        sender_name: me.name,
        message: result.fileName,
        message_type: typeOverride || result.messageType,
        file_url: result.url,
        file_name: result.fileName,
        file_type: result.fileType,
        file_size: result.fileSize,
        reply_to_id: replyTo ? replyTo.id : null,
      });

      if (error) throw new Error(error.message);
      setReplyTo(null);
    } catch (error) {
      showNotice(error.message);
    } finally {
      setFileSending(false);
    }
  }

  function handleFilePicker(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadFile(file);
  }

  async function openCamera() {
    setShowFiles(false);
    setCameraPreview(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      showNotice("Camera access is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch {
      showNotice("Camera permission was denied or the camera is unavailable.");
    }
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      showNotice("Camera is not ready yet.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setCameraPreview(canvas.toDataURL("image/jpeg", 0.88));
    stopCamera();
  }

  async function sendCameraPhoto() {
    if (!cameraPreview) return;
    const blob = await (await fetch(cameraPreview)).blob();
    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    setCameraPreview(null);
    await uploadFile(file, "image");
  }

  function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showNotice("Voice recording is not supported by this browser.");
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size) audioChunksRef.current.push(event.data);
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });

          if (blob.size > MAX_FILE_SIZE) {
            showNotice("Voice note is too large. Maximum size is 5 MB.");
            return;
          }

          const extension = (recorder.mimeType || "").includes("mp4") ? "m4a" : "webm";
          const file = new File([blob], `voice-${Date.now()}.${extension}`, {
            type: blob.type || "audio/webm",
          });
          await uploadFile(file, "audio");
        };

        recorder.start();
        setRecording(true);
        setRecordingSeconds(0);
        recordingTimerRef.current = window.setInterval(() => {
          setRecordingSeconds((seconds) => {
            if (seconds >= 299) {
              stopRecording();
              return seconds;
            }
            return seconds + 1;
          });
        }, 1000);
      })
      .catch(() => showNotice("Microphone permission was denied or unavailable."));
  }

  function stopRecording() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatSize(bytes) {
    if (!bytes) return "";
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  if (loading) return <p className="loading-text">Loading chat...</p>;

  if (pageError || !me || !target) {
    return (
      <div className="home-container">
        <div className="home-card">
          <h1>Chat</h1>
          <p className="error-text">{pageError || "Chat could not be opened."}</p>
          <button className="primary-button" onClick={() => router.push("/")}>
            Go to Sign Up / Log In
          </button>
        </div>
      </div>
    );
  }

  if (me.username === target.username) {
    return (
      <div className="home-container">
        <div className="home-card">
          <h1>Your Chat Link</h1>
          <p>Share this link with someone you want to chat with:</p>
          <div className="link-box">{`${window.location.origin}/${me.username}`}</div>
          <p className="warning-text">
            When another logged-in user opens your link, the conversation is created between the two unique usernames.
          </p>
          <button className="primary-button" onClick={() => router.push("/")}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="leave-link" onClick={() => router.push("/")}>Back</button>
        <div>
          <div className="chat-title">{target.name}</div>
          <div className="chat-subtitle">@{target.username}</div>
        </div>
        <div className="header-spacer" />
      </div>

      <div className="messages-container">
        {messages.map((msg) => {
          const isOwn = msg.sender_username === me.username;
          const replied = msg.reply_to_id
            ? messages.find((item) => item.id === msg.reply_to_id)
            : null;

          return (
            <div key={msg.id} className={`message-bubble ${isOwn ? "own" : ""}`}>
              {!isOwn && <div className="message-sender">{msg.sender_name} @{msg.sender_username}</div>}

              {replied && (
                <div className="message-reply-preview">
                  Replying to {replied.sender_name}: {replied.message?.slice(0, 60)}
                </div>
              )}

              {msg.message_type === "image" && msg.file_url ? (
                <div className="attachment">
                  <img src={msg.file_url} alt={msg.file_name || "Shared photo"} className="shared-image" />
                  <a href={msg.file_url} target="_blank" rel="noreferrer" className="file-name">{msg.file_name}</a>
                </div>
              ) : msg.message_type === "audio" && msg.file_url ? (
                <div className="attachment">
                  <audio controls src={msg.file_url} />
                  <div className="file-name">{msg.file_name} · {formatSize(msg.file_size)}</div>
                </div>
              ) : msg.file_url ? (
                <div className="attachment file-attachment">
                  <a href={msg.file_url} target="_blank" rel="noreferrer" className="file-name">
                    {msg.file_name}
                  </a>
                  <div className="file-meta">{formatSize(msg.file_size)}</div>
                </div>
              ) : (
                <div className="message-text">{msg.message}</div>
              )}

              <div className="message-time">{formatTime(msg.created_at)}</div>
              <button className="message-reply-button" onClick={() => setReplyTo(msg)}>Reply</button>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {notice && <div className="notice">{notice}</div>}

      {replyTo && (
        <div className="reply-preview-bar">
          <span>Replying to {replyTo.sender_name}: {replyTo.message?.slice(0, 60)}</span>
          <button onClick={() => setReplyTo(null)}>Close</button>
        </div>
      )}

      <div className="composer">
        {showFiles && (
          <div className="attachment-menu">
            <button onClick={() => fileInputRef.current?.click()}>Choose File</button>
            <button onClick={() => cameraInputRef.current?.click()}>Take / Choose Photo</button>
            <button onClick={openCamera}>Open Camera</button>
            <button onClick={recording ? stopRecording : startRecording}>
              {recording ? `Stop Voice (${recordingSeconds}s)` : "Record Voice Note"}
            </button>
          </div>
        )}

        <form className="composer-row" onSubmit={sendText}>
          <button
            type="button"
            className="attach-button"
            onClick={() => setShowFiles((value) => !value)}
            disabled={fileSending}
            aria-label="Files"
          >
            Files
          </button>

          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            onChange={handleFilePicker}
          />

          <input
            ref={cameraInputRef}
            className="hidden-file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFilePicker}
          />

          <input
            className="composer-input"
            type="text"
            placeholder={fileSending ? "Uploading..." : "Type a message..."}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            maxLength={2000}
            disabled={fileSending}
          />

          <button className="send-button" type="submit" disabled={sending || !newMessage.trim()}>
            Send
          </button>
        </form>
        <div className="file-limit">Files, photos, documents and voice notes · maximum 5 MB · videos are not allowed.</div>
      </div>

      {cameraOpen && (
        <div className="camera-modal">
          <div className="camera-card">
            <video ref={videoRef} className="camera-video" muted playsInline />
            <div className="camera-actions">
              <button className="secondary-button" onClick={stopCamera}>Cancel</button>
              <button className="primary-button camera-take-button" onClick={takePhoto}>Take Photo</button>
            </div>
          </div>
        </div>
      )}

      {cameraPreview && (
        <div className="camera-modal">
          <div className="camera-card">
            <img src={cameraPreview} alt="Photo preview" className="camera-preview" />
            <div className="camera-actions">
              <button className="secondary-button" onClick={() => setCameraPreview(null)}>Retake</button>
              <button className="primary-button camera-take-button" onClick={sendCameraPhoto}>Send Photo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
