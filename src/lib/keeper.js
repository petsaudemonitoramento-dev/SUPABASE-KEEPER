import { getAdminClient } from "@/lib/supabase-admin";
import { decryptValue } from "@/lib/crypto";
import { pingSupabase } from "@/lib/ping";

export async function getProjectsForUser(userId) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("keeper_projects")
    .select("id,name,project_url,enabled,last_status,last_ping_at,last_success_at,last_latency_ms,last_http_status,last_error,consecutive_failures,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error("Não foi possível carregar os projetos.");
  return data || [];
}

export async function getProjectForUser(userId, projectId) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("keeper_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar o projeto.");
  return data || null;
}

export async function getLogsForUser(userId, projectId, limit = 40) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("keeper_ping_logs")
    .select("id,status,source,latency_ms,http_status,error_message,created_at")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error("Não foi possível carregar o histórico.");
  return data || [];
}

export async function recordPing(project, result, source) {
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const status = result.ok ? "online" : "error";

  const { error: logError } = await admin.from("keeper_ping_logs").insert({
    project_id: project.id,
    user_id: project.user_id,
    status,
    source,
    latency_ms: result.latencyMs ?? null,
    http_status: result.httpStatus ?? null,
    error_message: result.error ?? null
  });

  if (logError) throw new Error("Falha ao registrar o histórico do ping.");

  const changes = {
    last_status: status,
    last_ping_at: now,
    last_latency_ms: result.latencyMs ?? null,
    last_http_status: result.httpStatus ?? null,
    last_error: result.error ?? null,
    consecutive_failures: result.ok ? 0 : (project.consecutive_failures || 0) + 1,
    updated_at: now
  };

  if (result.ok) changes.last_success_at = now;

  const { error: updateError } = await admin
    .from("keeper_projects")
    .update(changes)
    .eq("id", project.id);

  if (updateError) throw new Error("Falha ao atualizar o status do projeto.");
}

export async function pingAndRecord(project, source = "manual") {
  let result;

  try {
    const key = decryptValue(project.key_ciphertext);
    result = await pingSupabase({
      projectUrl: project.project_url,
      publishableKey: key,
      pingPath: project.ping_path
    });
  } catch {
    result = {
      ok: false,
      latencyMs: null,
      httpStatus: null,
      error: "Não foi possível ler a credencial criptografada deste projeto."
    };
  }

  await recordPing(project, result, source);
  return result;
}

export async function runScheduledKeepAlive() {
  const admin = getAdminClient();
  const { data: projects, error } = await admin
    .from("keeper_projects")
    .select("*")
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (error) throw new Error("Falha ao carregar os projetos ativos.");

  let online = 0;
  let failed = 0;
  const list = projects || [];
  const concurrency = 4;

  for (let index = 0; index < list.length; index += concurrency) {
    const chunk = list.slice(index, index + concurrency);

    await Promise.all(
      chunk.map(async (project) => {
        try {
          const result = await pingAndRecord(project, "scheduled");
          if (result.ok) online += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      })
    );
  }

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("keeper_ping_logs").delete().lt("created_at", cutoff);

  return {
    total: list.length,
    online,
    failed
  };
}
