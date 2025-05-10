/// <reference types="vite/client" />

import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Database } from '../shared/supabase';

const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be provided in environment variables.");
}

// Initialize with the Database generic for schema-specific types
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// The SupabaseClient type can also be more specific if needed, though often inferred
// export const supabase: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabaseAnonKey);

export async function getUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser(); // getUser itself is not schema-specific in this way
  if (error) {
    console.error("Error getting user:", error);
    return null;
  }
  return data.user;
} 