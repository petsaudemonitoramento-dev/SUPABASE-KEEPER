import { runScheduledKeepAlive } from "@/lib/keeper";

export async function handleCron(request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("keeper cron error: CRON_SECRET not configured");
    return Response.json({
      ok: false,
      schedulerError: true,
      reason: "cron_not_configured"
    });
  }

  const expected = `Bearer ${secret}`;
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
    // Erros globais também retornam 200 ao scheduler para evitar uma sequência
    // de notificações externas. O detalhe técnico continua disponível nos logs.
    console.error("keeper cron error", error instanceof Error ? error.message : "unknown");

    return Response.json({
      ok: false,
      schedulerError: true
    });
  }
}
