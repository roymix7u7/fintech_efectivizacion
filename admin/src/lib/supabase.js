import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Sin esto, una variable de entorno ausente produce un "Invalid URL"
// dificil de rastrear en vez de decir que falta configurar .env.local.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
