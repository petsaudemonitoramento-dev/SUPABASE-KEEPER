import { requiredEnv } from "@/lib/env";
import { runScheduledKeepAlive } from "@/lib/keeper";

export async function handleCron(request) {
  const expected = `Bearer ${requiredEnv("CRON_SECRET")}`;
  const received = request.headers.get("authorization");

  if (received !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runScheduledKeepAlive();

    // Mesmo que algum projeto falhe, o cron conclui com HTTP 200.
    // A falha individual fica registrada somente no painel.
    return Response.json({
      ok: true,
      ...result
    });
  } catch (error) {
    // Evita transformar indisponibilidades temporárias em uma cadeia de
    // notificações de falha do scheduler.
    console.error("keeper cron error", error instanceof Error ? error.message : "unknown");

    return Response.json({
      ok: false,
      schedulerError: true
    });
  }
}
