import { neon } from "@neondatabase/serverless";
import { requiredEnv } from "@/lib/env";

let sqlClient;

export function db() {
  if (!sqlClient) {
    sqlClient = neon(requiredEnv("DATABASE_URL"));
  }

  return sqlClient;
}
