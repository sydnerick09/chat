import { useState } from "react";
import { useRouter } from "next/router";
import { generateRoomId } from "../lib/generateRoomId";

export default function Home() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [roomLink, setRoomLink] = useState("");
  const [copied, setCopied] = useState(false);

  // Creates a brand new room ID and shows a shareable link.
  // We do NOT need to "save" the room anywhere in the database first —
  // the room is simply identified by its ID in the URL. The first
  // message sent into that room is what makes it "exist" in the data.
  function handleCreateChat() {
    setCreating(true);
    const roomId = generateRoomId();
    const link = `${window.location.origin}/chat/${roomId}`;
    setRoomLink(link);
    setCreating(false);
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(roomLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleGoToChat() {
    const roomId = roomLink.split("/").pop();
    router.push(`/chat/${roomId}`);
  }

  return (
    <div className="home-container">
      <div className="home-card">
        <h1>Realtime Chat</h1>
        <p>
          Create a private chat link and send it to someone. No account or
          password needed — just a name.
        </p>

        {!roomLink && (
          <button
            className="primary-button"
            onClick={handleCreateChat}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create Chat"}
          </button>
        )}

        {roomLink && (
          <>
            <div className="link-box">{roomLink}</div>
            <button className="secondary-button" onClick={handleCopyLink}>
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              className="primary-button"
              style={{ marginTop: 10 }}
              onClick={handleGoToChat}
            >
              Enter This Chat
            </button>
            <p className="warning-text">
              Anyone with this link can join this chat. Do not share the
              link publicly.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
