import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth?action=me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          name: name.trim(),
          username: username.trim().toLowerCase(),
          password,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Something went wrong.");
        return;
      }

      setUser(data.user);
      setPassword("");
      setMessage(mode === "signup" ? "Account created." : "Logged in.");
    } catch {
      setMessage("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth?action=logout", { method: "POST" });
    setUser(null);
    setMessage("Logged out.");
  }

  function copyLink() {
    const link = `${window.location.origin}/${user.username}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (user) {
    const link = typeof window !== "undefined"
      ? `${window.location.origin}/${user.username}`
      : `/${user.username}`;

    return (
      <div className="home-container">
        <div className="home-card">
          <h1>Realtime Chat</h1>
          <p className="account-label">Signed in as</p>
          <h2 className="username-heading">@{user.username}</h2>
          <p>Your personal chat link:</p>
          <div className="link-box">{link}</div>
          <button className="primary-button" onClick={copyLink}>
            {copied ? "Link Copied" : "Copy My Link"}
          </button>
          <button
            className="secondary-button full-width-button"
            onClick={() => router.push(`/${user.username}`)}
          >
            Open My Chat
          </button>
          <button className="text-button" onClick={logout}>
            Log Out
          </button>
          {message && <p className="success-text">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="home-card">
        <h1>Realtime Chat</h1>
        <p>
          Create an account with your name, a unique username, and a password.
          Your username becomes your personal chat link.
        </p>

        <div className="auth-tabs">
          <button
            className={mode === "signup" ? "auth-tab active" : "auth-tab"}
            onClick={() => { setMode("signup"); setMessage(""); }}
          >
            Sign Up
          </button>
          <button
            className={mode === "login" ? "auth-tab active" : "auth-tab"}
            onClick={() => { setMode("login"); setMessage(""); }}
          >
            Log In
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <input
              className="name-entry-input"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
            />
          )}

          <input
            className="name-entry-input"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            maxLength={30}
            pattern="[a-z0-9_-]+"
            required
            autoFocus={mode === "login"}
          />

          <input
            className="name-entry-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={200}
            required
          />

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "signup" ? "Create Account" : "Log In"}
          </button>
        </form>

        {message && <p className="error-text">{message}</p>}

        <p className="warning-text">
          Username rules: lowercase letters, numbers, underscore, and hyphen
          only. Usernames are unique.
        </p>
      </div>
    </div>
  );
}
