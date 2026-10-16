import { db } from "@/lib/db";

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

export async function checkSite(siteUrl) {
  const endpoint = normalizeSiteUrl(siteUrl);
  const started = performance.now();
  try {
    const response = await fetch(endpoint + "/", {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: { "user-agent": "supabase-keeper-site-check/1.0", accept: "text/html,application/json;q=0.9,*/*;q=0.1" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    const httpStatus = response.status;
    // A protected login page can legitimately redirect; never follow the Location header.
    const status = httpStatus >= 200 && httpStatus < 400
      ? "online"
      : httpStatus === 401 || httpStatus === 403 ? "protected" : "error";
    return {
      status,
      latencyMs,
      httpStatus,
      error: status === "error" ? "HTTP " + httpStatus : null
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
    where user_id = ${userId} and site_id = ${siteId}
    order by created_at desc limit 40
  `;
}

export async function getSiteStatsForUser(userId) {
  const sql = db();
  return sql`
    select s.id as site_id,
      count(l.id)::int as checks,
      count(l.id) filter (where l.status = 'online')::int as successful,
      count(l.id) filter (where l.status = 'protected')::int as protected,
      round(avg(l.latency_ms) filter (where l.status = 'online'))::int as avg_latency_ms,
      max(l.latency_ms) filter (where l.status = 'online') as max_latency_ms
    from keeper_sites s
    left join keeper_site_logs l on l.site_id = s.id
      and l.created_at >= now() - interval '7 days'
    where s.user_id = ${userId}
    group by s.id
  `;
}

export async function getSiteDailyStatsForUser(userId, siteId) {
  const sql = db();
  return sql`
    select (l.created_at at time zone 'America/Fortaleza')::date as day,
      round(avg(l.latency_ms) filter (where l.status = 'online'))::int as avg_latency_ms,
      count(*)::int as checks,
      count(*) filter (where l.status = 'online')::int as successful
    from keeper_site_logs l
    where l.user_id = ${userId} and l.site_id = ${siteId}
      and l.created_at >= now() - interval '7 days'
    group by day order by day
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

export async function pingAndRecordSite(site, source = "manual") {
  // Revalidate stored URL before every outbound request.
  const result = await checkSite(site.site_url);
  const sql = db();
  await sql`
    insert into keeper_site_logs
      (site_id, user_id, status, source, latency_ms, http_status, error_message)
    values (${site.id}, ${site.user_id}, ${result.status}, ${source},
      ${result.latencyMs}, ${result.httpStatus}, ${result.error})
  `;
  const failed = result.status === "error"
    ? Number(site.consecutive_failures || 0) + 1 : 0;
  await sql`
    update keeper_sites set last_status = ${result.status}, last_check_at = now(),
      last_success_at = case when ${result.status} = 'online' then now() else last_success_at end,
      last_latency_ms = ${result.latencyMs}, last_http_status = ${result.httpStatus},
      last_error = ${result.error}, consecutive_failures = ${failed}, updated_at = now()
    where id = ${site.id} and user_id = ${site.user_id}
  `;
  return result;
}

export async function runScheduledSites() {
  const sql = db();
  const sites = await sql`
    select * from keeper_sites where enabled = true order by created_at asc
  `;
  let online = 0;
  let protectedCount = 0;
  let failed = 0;
  for (let index = 0; index < sites.length; index += 4) {
    const results = await Promise.allSettled(
      sites.slice(index, index + 4).map(site => pingAndRecordSite(site, "scheduled"))
    );
    for (const result of results) {
      const status = result.status === "fulfilled" ? result.value.status : "error";
      if (status === "online") online++;
      else if (status === "protected") protectedCount++;
      else failed++;
    }
  }
  await sql`
    delete from keeper_site_logs where created_at < now() - interval '90 days'
  `;
  return { total: sites.length, online, protected: protectedCount, failed };
}
