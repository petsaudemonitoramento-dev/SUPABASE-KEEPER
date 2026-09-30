import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "@/lib/env";

let adminClient;

export function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SECRET_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );
  }

  return adminClient;
}
