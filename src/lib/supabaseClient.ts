import * as dotenv from 'dotenv';
dotenv.config();

/// <reference types="vite/client" />

import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Database } from '../shared/supabase.js';

const supabaseUrl: string | undefined = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey: string | undefined = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Supabase URL and Service Key must be provided in environment variables.");
}

// Initialize with the Database generic for schema-specific types
export const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

// The SupabaseClient type can also be more specific if needed, though often inferred
// export const supabase: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabaseServiceKey);

export async function getUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser(); // getUser itself is not schema-specific in this way
  if (error) {
    console.error("Error getting user:", error);
    return null;
  }
  return data.user;
} 