// This file creates ONE shared Supabase client for the whole app.
//
// IMPORTANT: This uses the "anon" (public) key only. That key is safe to
// ship to the browser AS LONG AS you have Row Level Security (RLS) policies
// turned on in Supabase (see supabase/schema.sql). NEVER put your
// "service_role" key in this file or anywhere in frontend code.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // This warning helps beginners quickly notice a missing .env.local file.
  console.warn(
    "Supabase environment variables are missing. Did you create .env.local from .env.local.example?"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
