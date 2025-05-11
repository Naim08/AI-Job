/// <reference types="vite/client" />

import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Database } from '../shared/supabase.js';
import dotenv from 'dotenv';

// Load .env file only when not in a Vite environment (e.g., running with Node)
if (typeof import.meta.env === 'undefined') {
  dotenv.config();
}
// console.log(process.env); // Removed debugging line

// Use import.meta.env for Vite, process.env for Node
const supabaseUrl: string | undefined = typeof import.meta.env !== 'undefined'
                                      ? import.meta.env.VITE_SUPABASE_URL
                                      : process.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string | undefined = typeof import.meta.env !== 'undefined'
                                          ? import.meta.env.VITE_SUPABASE_ANON_KEY
                                          : process.env.VITE_SUPABASE_ANON_KEY;

let finalSupabaseKey: string | undefined;
const isNodeEnvironment = typeof import.meta.env === 'undefined';

if (isNodeEnvironment) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (serviceKey) {
    finalSupabaseKey = serviceKey;
    console.log('[SupabaseClient] Initializing with SERVICE ROLE KEY for Node.js environment.');
  } else {
    finalSupabaseKey = supabaseAnonKey;
    console.warn('[SupabaseClient] WARNING: Initializing with ANON KEY for Node.js environment. RLS will apply. Consider setting SUPABASE_SERVICE_KEY in .env for backend scripts if elevated privileges are needed.');
  }
} else {
  finalSupabaseKey = supabaseAnonKey;
}

if (!supabaseUrl) {
  throw new Error(
    `Supabase URL (VITE_SUPABASE_URL in .env or environment variables) must be provided.`
  );
}

if (!finalSupabaseKey) {
  let keyMissingMessage = "Supabase Key must be provided. ";
  if (isNodeEnvironment) {
    keyMissingMessage += "(Set VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY in .env for Node.js)";
  } else { // Vite
    keyMissingMessage += "(VITE_SUPABASE_ANON_KEY in .env or environment variables for Vite)";
  }
  throw new Error(keyMissingMessage);
}

// Initialize with the Database generic for schema-specific types
export const supabase = createClient<Database>(supabaseUrl, finalSupabaseKey);

// The SupabaseClient type can also be more specific if needed, though often inferred
// export const supabase: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabaseAnonKey);

export async function getUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Error getting user:", error);
    return null;
  }
  return data.user;
} 