// Generates a random, hard-to-guess room ID like "aK3f9QxZ2mPq"
// This is NOT a password. It just makes the chat link hard to guess,
// the same way a "secret link" works in tools like Google Docs sharing.

export function generateRoomId(length = 12) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}
