import { handleCron } from "@/lib/cron-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  return handleCron(request);
}
