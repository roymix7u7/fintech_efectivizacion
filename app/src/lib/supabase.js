import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

let storage;

if (Platform.OS === "web") {
  storage = {
    getItem: (key) => Promise.resolve(localStorage.getItem(key)),
    setItem: (key, value) => Promise.resolve(localStorage.setItem(key, value)),
    removeItem: (key) => Promise.resolve(localStorage.removeItem(key)),
  };
} else {
  const SecureStore = require("expo-secure-store");
  storage = {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  };
}

export const SUPABASE_URL = "https://zsrjctabxqrgunlzvzru.supabase.co";
const supabaseUrl = SUPABASE_URL;
// Pública por diseño (va en el app); la seguridad la ponen las políticas RLS.
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzcmpjdGFieHFyZ3VubHp2enJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTQxODgsImV4cCI6MjA5NTU5MDE4OH0.TH2wZO7fmQbsufCtmGBYDVo-XOLdVUlyreIzJ2PnaHU";

export const supabase = createClient(supabaseUrl, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
