import { handleCron } from "@/lib/cron-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Three probes per site, five seconds apart; runs for all sites in parallel batches.
export const maxDuration = 60;

export async function GET(request) {
  return handleCron(request);
}
