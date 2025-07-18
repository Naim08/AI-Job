/// <reference types="vite/client" />

import { createClient, User } from "@supabase/supabase-js";
import { Database } from "../shared/supabase.ts";
import dotenv from "dotenv";

// Determine if we are in a Node.js-like environment (e.g., Electron main process)
const isNodeEnvironment = typeof import.meta.env === "undefined";

// If in a Node.js environment, load .env variables.
// This assumes that if this module is imported in the main process,
// the main entry point (electron/main.ts) has already called dotenv.config().
// This call here is a secondary measure or for cases where this module might be run standalone in Node.
if (isNodeEnvironment) {
  dotenv.config();
}

// Get Supabase URL and Anon Key based on the environment
const supabaseUrl: string | undefined = isNodeEnvironment
  ? process.env.VITE_SUPABASE_URL
  : import.meta.env.VITE_SUPABASE_URL;

const supabaseAnonKey: string | undefined = isNodeEnvironment
  ? process.env.VITE_SUPABASE_ANON_KEY
  : import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseServiceKey: string | undefined = isNodeEnvironment
  ? process.env.SUPABASE_SERVICE_KEY
  : import.meta.env.SUPABASE_SERVICE_KEY;
let finalSupabaseKey: string | undefined;

if (isNodeEnvironment) {
  // In Node.js environment (Electron main process), prioritize service key
  const serviceKeyFromEnv = process.env.SUPABASE_SERVICE_KEY;
  if (serviceKeyFromEnv) {
    finalSupabaseKey = serviceKeyFromEnv;
    console.log(
      "[SupabaseClient] Initializing with SERVICE ROLE KEY for Node.js environment."
    );
  } else {
    finalSupabaseKey = supabaseAnonKey; // Fallback to anon key if service key isn't set
    console.warn(
      "[SupabaseClient] WARNING: Node.js environment AND SUPABASE_SERVICE_KEY not found. Initializing with VITE_SUPABASE_ANON_KEY. RLS will apply."
    );
  }
} else {
  // In Vite/renderer environment, always use anon key
  finalSupabaseKey = supabaseAnonKey;
  // console.log('[SupabaseClient] Initializing with ANON KEY for Vite/renderer environment.');
}

// Validate that necessary Supabase credentials are set
if (!supabaseUrl) {
  throw new Error(
    `Supabase URL (VITE_SUPABASE_URL) must be provided via .env or environment variables.`
  );
}

if (!finalSupabaseKey) {
  let keyMissingMessage = "Supabase Key must be provided. ";
  if (isNodeEnvironment) {
    keyMissingMessage +=
      "(Ensure VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY is in .env for Node.js)";
  } else {
    // Vite
    keyMissingMessage += "(Ensure VITE_SUPABASE_ANON_KEY is in .env for Vite)";
  }
  throw new Error(keyMissingMessage);
}

// Initialize and export the Supabase client
export const supabase = createClient<Database>(supabaseUrl, finalSupabaseKey);

// Helper function to get the current user (primarily for renderer or auth-context scenarios)
export async function getUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Error getting user:", error);
    return null;
  }
  return data.user;
}

// The SupabaseClient type can also be more specific if needed, though often inferred
// export const supabase: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabaseAnonKey);
