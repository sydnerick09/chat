import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const username = String(req.query.username || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: "Invalid username." });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,name,username")
    .eq("username", username)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Username not found." });

  return res.status(200).json({ user: data });
}
