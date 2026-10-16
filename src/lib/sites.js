import { db } from "@/lib/db";
import { summarizeProbes } from "@/lib/site-metrics.mjs";

const TIMEOUT_MS = 8000;

// Hosts Vercel HTTPS only. No paths, ports, credentials, query strings or redirects.
export function normalizeSiteUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("Endereço do site inválido.");
  }
  if (
    url.protocol !== "https:" ||
    url.username || url.password || url.port || url.search || url.hash ||
    url.pathname !== "/" ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?[.]vercel[.]app$/.test(url.hostname)
  ) {
    throw new Error("Use somente o domínio HTTPS de produção no formato https://nome.vercel.app.");
  }
  return "https://" + url.hostname;
}

// Apenas estas aplicações fornecem liveness público de contrato JSON.
// Outros domínios Vercel cadastrados continuam usando o monitoramento legado na raiz.
const FAST_HEALTH_HOSTS = new Set([
  "maeaps.vercel.app",
  "gestarioaps.vercel.app"
]);

export function siteProbePath(siteUrl) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const host = new URL(baseUrl).hostname;
  return FAST_HEALTH_HOSTS.has(host) ? "/api/health/live" : "/";
}

export async function checkSite(siteUrl) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const path = siteProbePath(baseUrl);
  const isFastHealth = path !== "/";
  const started = performance.now();

  try {
    const response = await fetch(baseUrl + path, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: {
        "user-agent": "supabase-keeper-site-check/1.1",
        accept: isFastHealth ? "application/json" : "text/html,application/json;q=0.9,*/*;q=0.1"
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    const httpStatus = response.status;
    let status;
    let error = null;

    if (isFastHealth) {
      // Verificar conteúdo evita falso "online" caso login/erro retorne HTTP 200.
      if (httpStatus === 200) {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) {
          status = "error";
          error = "A rota de saúde não retornou JSON.";
        } else {
          const payload = await response.json().catch(() => null);
          status = payload?.status === "ok" ? "online" : "error";
          if (status === "error") error = "Resposta inválida da rota de saúde.";
        }
      } else if ([301, 302, 303, 307, 308, 401, 403].includes(httpStatus)) {
        status = "protected";
        error = "A rota pública de saúde está redirecionando ou exigindo autenticação.";
      } else {
        status = "error";
        error = "HTTP " + httpStatus + " na rota de saúde.";
      }
    } else {
      // Compatibilidade com outros sites cadastrados antes desta melhoria.
      status = httpStatus >= 200 && httpStatus < 400
        ? "online"
        : httpStatus === 401 || httpStatus === 403 ? "protected" : "error";
      if (status === "error") error = "HTTP " + httpStatus;
    }

    return {
      status,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      httpStatus,
      error
    };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      status: "error",
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      httpStatus: null,
      error: timedOut ? "A verificação ultrapassou 8 segundos." : "Não foi possível alcançar o site."
    };
  }
}

const PROBES_PER_ROUND = 3;
const PROBE_PAUSE_MS = 5000;
const CHECK_LEASE_SECONDS = 90;


async function pauseBetweenProbes() {
  await new Promise(resolve => setTimeout(resolve, PROBE_PAUSE_MS));
}

export async function getSitesForUser(userId) {
  const sql = db();
  return sql`
    select id, user_id, name, site_url, enabled, last_status,
      last_check_at, last_success_at, last_latency_ms, last_http_status,
      last_error, consecutive_failures, created_at
    from keeper_sites where user_id = ${userId}
    order by created_at asc
  `;
}

export async function getSiteForUser(userId, siteId) {
  const sql = db();
  const results = await sql`
    select * from keeper_sites where id = ${siteId} and user_id = ${userId} limit 1
  `;
  return results[0] || null;
}

export async function getSiteLogsForUser(userId, siteId) {
  const sql = db();
  return sql`
    select status, source, latency_ms, http_status, error_message, created_at
    from keeper_site_logs
    where user_id = ${userId} and site_id = ${siteId} and round_id is null
    order by created_at desc limit 20
  `;
}

export async function getSiteStatsForUser(userId, days = 7) {
  const sql = db();
  const safeDays = days === 30 ? 30 : 7;
  return sql`
    select s.id as site_id,
      count(r.id)::int as checks,
      count(r.id) filter (where r.status = 'online')::int as successful,
      count(r.id) filter (where r.success_count = 3)::int as fully_healthy,
      count(r.id) filter (where r.status = 'protected')::int as protected,
      round(avg(r.median_ms) filter (where r.status = 'online'))::int as avg_latency_ms,
      max(r.max_ms) as max_latency_ms
    from keeper_sites s
    left join keeper_site_rounds r on r.site_id = s.id
      and r.created_at >= now() - ${safeDays} * interval '1 day'
    where s.user_id = ${userId}
    group by s.id
  `;
}

export async function getSiteRoundsForUser(userId, siteId, limit = 40) {
  const sql = db();
  const safeLimit = Math.min(80, Math.max(1, Number(limit) || 40));
  return sql`
    select r.id,r.status,r.source,r.success_count,r.sample_count,
      r.median_ms,r.mean_ms,r.min_ms,r.max_ms,r.error_message,r.created_at,
      coalesce((
        select json_agg(json_build_object(
          'index',l.sample_index, 'latencyMs',l.latency_ms,
          'httpStatus',l.http_status, 'status',l.status, 'error',l.error_message
        ) order by l.sample_index)
        from keeper_site_logs l where l.round_id = r.id
      ), '[]'::json) as samples
    from keeper_site_rounds r
    where r.site_id = ${siteId} and r.user_id = ${userId}
    order by r.created_at desc limit ${safeLimit}
  `;
}

export async function getSiteTrendForUser(userId, siteId, days = 30) {
  const sql = db();
  const safeDays = days === 7 ? 7 : 30;
  return sql`
    select created_at, median_ms, min_ms, max_ms, success_count, status
    from keeper_site_rounds
    where user_id = ${userId} and site_id = ${siteId}
      and created_at >= now() - ${safeDays} * interval '1 day'
    order by created_at asc limit 300
  `;
}

export async function getSitesTrendForUser(userId, days = 30) {
  const sql = db();
  const safeDays = days === 7 ? 7 : 30;
  return sql`
    select s.name, r.site_id, r.created_at, r.median_ms, r.status
    from keeper_site_rounds r
    join keeper_sites s on s.id = r.site_id
    where r.user_id = ${userId}
      and r.created_at >= now() - ${safeDays} * interval '1 day'
    order by r.created_at asc limit 500
  `;
}

export async function getProjectStatsForUser(userId) {
  const sql = db();
  return sql`
    select p.id as project_id, count(l.id)::int as checks,
      count(l.id) filter (where l.status = 'online')::int as successful,
      round(avg(l.latency_ms) filter (where l.status = 'online'))::int as avg_latency_ms,
      max(l.latency_ms) filter (where l.status = 'online') as max_latency_ms
    from keeper_projects p
    left join keeper_ping_logs l on l.project_id = p.id
      and l.created_at >= now() - interval '7 days'
    where p.user_id = ${userId}
    group by p.id
  `;
}

// A lease atomically prevents manual clicks and the cron from running simultaneously
// against the same site. An abandoned lease expires after 90 seconds.
export async function pingAndRecordSite(site, source = "manual") {
  const sql = db();
  const claimRows = await sql`
    update keeper_sites set check_started_at = now()
    where id = ${site.id} and user_id = ${site.user_id}
      and (check_started_at is null
        or check_started_at < now() - ${CHECK_LEASE_SECONDS} * interval '1 second')
    returning check_started_at
  `;
  if (!claimRows.length) return { skipped: true };

  const claimedAt = claimRows[0].check_started_at;
  try {
    const samples = [];
    for (let index = 0; index < PROBES_PER_ROUND; index++) {
      if (index !== 0) await pauseBetweenProbes();
      samples.push(await checkSite(site.site_url));
    }
    const summary = summarizeProbes(samples);
    const { randomUUID } = await import("node:crypto");
    const roundId = randomUUID();

    await sql.transaction([
      sql`
        insert into keeper_site_rounds
          (id, site_id, user_id, source, status, sample_count, success_count,
           median_ms, mean_ms, min_ms, max_ms, error_message)
        values (${roundId}, ${site.id}, ${site.user_id}, ${source}, ${summary.status},
          ${PROBES_PER_ROUND}, ${summary.successCount}, ${summary.medianMs},
          ${summary.meanMs}, ${summary.minMs}, ${summary.maxMs}, ${summary.error})
      `,
      ...samples.map((probe,index) => sql`
        insert into keeper_site_logs
          (site_id, user_id, round_id, sample_index, status, source,
           latency_ms, http_status, error_message)
        values (${site.id}, ${site.user_id}, ${roundId}, ${index + 1},
          ${probe.status}, ${source}, ${probe.latencyMs},
          ${probe.httpStatus}, ${probe.error})
      `),
      sql`
        update keeper_sites set last_status = ${summary.status}, last_check_at = now(),
          last_success_at = case when ${summary.status} = 'online' then now() else last_success_at end,
          last_latency_ms = ${summary.medianMs}, last_http_status = ${summary.httpStatus},
          last_error = ${summary.error},
          consecutive_failures = case when ${summary.status} = 'online' then 0
            else consecutive_failures + 1 end,
          updated_at = now()
        where id = ${site.id} and user_id = ${site.user_id}
      `
    ]);

    return { ...summary, samples, roundId };
  } finally {
    // Do not clear a lease created by a newer request after this one expired.
    await sql`
      update keeper_sites set check_started_at = null
      where id = ${site.id} and user_id = ${site.user_id}
        and check_started_at = ${claimedAt}
    `;
  }
}

export async function runScheduledSites() {
  const sql = db();
  const sites = await sql`
    select * from keeper_sites where enabled = true order by created_at asc
  `;
  let online = 0;
  let protectedCount = 0;
  let failed = 0;
  let skipped = 0;
  for (let index = 0; index < sites.length; index += 4) {
    const results = await Promise.allSettled(
      sites.slice(index, index + 4).map(site => pingAndRecordSite(site, "scheduled"))
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value?.skipped) { skipped++; continue; }
      const status = result.status === "fulfilled" ? result.value.status : "error";
      if (status === "online") online++;
      else if (status === "protected") protectedCount++;
      else failed++;
    }
  }
  await sql`delete from keeper_site_logs where created_at < now() - interval '90 days'`;
  await sql`delete from keeper_site_rounds where created_at < now() - interval '90 days'`;
  return { total: sites.length, online, protected: protectedCount, failed, skipped };
}
