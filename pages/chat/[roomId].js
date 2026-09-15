import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

export default function ChatRoom() {
  const router = useRouter();
  const { roomId } = router.query;

  // ---- Name entry state ----
  // The name is only stored in localStorage, per the requirements.
  // It is a DISPLAY NAME, not authentication.
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [checkedStorage, setCheckedStorage] = useState(false);

  // ---- Chat state ----
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [replyTo, setReplyTo] = useState(null); // the message object being replied to
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);

  // Load any previously-entered name for this room from localStorage.
  useEffect(() => {
    if (!roomId) return;
    const storedName = window.localStorage.getItem(`chat-name-${roomId}`);
    if (storedName) {
      setName(storedName);
    }
    setCheckedStorage(true);
  }, [roomId]);

  function handleEnterChat(e) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    window.localStorage.setItem(`chat-name-${roomId}`, trimmed);
    setName(trimmed);
  }

  function handleLeaveChat() {
    router.push("/");
  }

  // Load existing messages, then subscribe to new ones in real time.
  useEffect(() => {
    if (!roomId || !name) return;

    let isMounted = true;

    async function loadMessages() {
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setLoadError(error.message);
      } else {
        setMessages(data);
      }
      setLoading(false);
    }

    loadMessages();

    // Subscribe to new messages inserted into this room.
    // Supabase Realtime pushes the new row to everyone listening
    // on this channel the moment it's inserted into the database.
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          setMessages((current) => [...current, payload.new]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, name]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendMessage(e) {
    e.preventDefault();
    const trimmed = newMessage.trim();
    if (!trimmed || sending) return;

    setSending(true);

    const { error } = await supabase.from("messages").insert({
      room_id: roomId,
      sender_name: name,
      message: trimmed,
      reply_to_id: replyTo ? replyTo.id : null,
    });

    if (error) {
      alert(`Could not send message: ${error.message}`);
    } else {
      setNewMessage("");
      setReplyTo(null);
      // Note: we don't manually add the message to state here —
      // the realtime subscription above will add it for us when
      // Supabase confirms the insert, so both people see it the
      // same way.
    }

    setSending(false);
  }

  function findMessageById(id) {
    return messages.find((m) => m.id === id);
  }

  function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ---------- Render: waiting on router / localStorage ----------
  if (!roomId || !checkedStorage) {
    return <p className="loading-text">Loading...</p>;
  }

  // ---------- Render: name entry screen ----------
  if (!name) {
    return (
      <div className="home-container">
        <div className="home-card">
          <h1>Enter Chat</h1>
          <p>What&apos;s your name?</p>
          <form onSubmit={handleEnterChat}>
            <input
              className="name-entry-input"
              type="text"
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={40}
              autoFocus
            />
            <button className="primary-button" type="submit">
              Enter Chat
            </button>
          </form>
          <p className="warning-text">
            Anyone with this link can join this chat. Do not share the link
            publicly. Entering a name is not a secure login — it&apos;s just
            a display name.
          </p>
        </div>
      </div>
    );
  }

  // ---------- Render: chat screen ----------
  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="leave-link" onClick={handleLeaveChat}>
          ← Leave Chat
        </button>
        <div className="chat-title">Room Chat</div>
        <div style={{ width: 70 }} /> {/* spacer to balance header */}
      </div>

      <div className="messages-container">
        {loading && <p className="loading-text">Loading messages...</p>}
        {loadError && (
          <p className="error-text">Could not load messages: {loadError}</p>
        )}

        {!loading &&
          !loadError &&
          messages.map((msg) => {
            const isOwn = msg.sender_name === name;
            const repliedMessage = msg.reply_to_id
              ? findMessageById(msg.reply_to_id)
              : null;

            return (
              <div
                key={msg.id}
                className={`message-bubble ${isOwn ? "own" : ""}`}
              >
                {!isOwn && (
                  <div className="message-sender">{msg.sender_name}</div>
                )}

                {repliedMessage && (
                  <div className="message-reply-preview">
                    Replying to {repliedMessage.sender_name}:{" "}
                    {repliedMessage.message.slice(0, 60)}
                  </div>
                )}
                {!repliedMessage && msg.reply_to_id && (
                  <div className="message-reply-preview">
                    Replying to a deleted or unavailable message
                  </div>
                )}

                <div className="message-text">{msg.message}</div>
                <div className="message-time">
                  {formatTime(msg.created_at)}
                </div>
                <button
                  className="message-reply-button"
                  onClick={() => setReplyTo(msg)}
                >
                  Reply
                </button>
              </div>
            );
          })}

        <div ref={messagesEndRef} />
      </div>

      <div className="composer">
        {replyTo && (
          <div className="reply-preview-bar">
            <span>
              Replying to {replyTo.sender_name}:{" "}
              {replyTo.message.slice(0, 50)}
            </span>
            <button onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}

        <form className="composer-row" onSubmit={handleSendMessage}>
          <input
            className="composer-input"
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            maxLength={2000}
          />
          <button
            className="send-button"
            type="submit"
            disabled={sending || !newMessage.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
