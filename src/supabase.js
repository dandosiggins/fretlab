import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when not configured — the app runs fully local-only in that case.
export const supabase = url && key ? createClient(url, key) : null;
