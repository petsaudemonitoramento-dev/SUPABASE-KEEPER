import { db } from "@/lib/db";
import { decryptValue } from "@/lib/crypto";
import { pingSupabase } from "@/lib/ping";

export async function getProjectsForUser(userId) {
  const sql = db();

  return sql`
    select
      id,
      name,
      project_url,
      enabled,
      last_status,
      last_ping_at,
      last_success_at,
      last_latency_ms,
      last_http_status,
      last_error,
      consecutive_failures,
      created_at,
      updated_at
    from keeper_projects
    where user_id = ${userId}
    order by created_at asc
  `;
}

export async function getProjectForUser(userId, projectId) {
  const sql = db();
  const rows = await sql`
    select *
    from keeper_projects
    where id = ${projectId}
      and user_id = ${userId}
    limit 1
  `;

  return rows[0] || null;
}

export async function getLogsForUser(userId, projectId, limit = 40) {
  const sql = db();
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);

  return sql`
    select
      id,
      status,
      source,
      latency_ms,
      http_status,
      error_message,
      created_at
    from keeper_ping_logs
    where user_id = ${userId}
      and project_id = ${projectId}
    order by created_at desc
    limit ${safeLimit}
  `;
}

export async function recordPing(project, result, source) {
  const sql = db();
  const status = result.ok ? "online" : "error";
  const failures = result.ok ? 0 : (project.consecutive_failures || 0) + 1;

  await sql`
    insert into keeper_ping_logs (
      project_id,
      user_id,
      status,
      source,
      latency_ms,
      http_status,
      error_message
    )
    values (
      ${project.id},
      ${project.user_id},
      ${status},
      ${source},
      ${result.latencyMs ?? null},
      ${result.httpStatus ?? null},
      ${result.error ?? null}
    )
  `;

  if (result.ok) {
    await sql`
      update keeper_projects
      set
        last_status = ${status},
        last_ping_at = now(),
        last_success_at = now(),
        last_latency_ms = ${result.latencyMs ?? null},
        last_http_status = ${result.httpStatus ?? null},
        last_error = null,
        consecutive_failures = 0,
        updated_at = now()
      where id = ${project.id}
    `;
  } else {
    await sql`
      update keeper_projects
      set
        last_status = ${status},
        last_ping_at = now(),
        last_latency_ms = ${result.latencyMs ?? null},
        last_http_status = ${result.httpStatus ?? null},
        last_error = ${result.error ?? null},
        consecutive_failures = ${failures},
        updated_at = now()
      where id = ${project.id}
    `;
  }
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
  const sql = db();
  const projects = await sql`
    select *
    from keeper_projects
    where enabled = true
    order by created_at asc
  `;

  let online = 0;
  let failed = 0;
  const concurrency = 4;

  for (let index = 0; index < projects.length; index += concurrency) {
    const chunk = projects.slice(index, index + concurrency);

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

  await sql`
    delete from keeper_ping_logs
    where created_at < now() - interval '90 days'
  `;

  return {
    total: projects.length,
    online,
    failed
  };
}
