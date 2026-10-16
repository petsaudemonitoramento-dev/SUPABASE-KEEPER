import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import StatusPill from "@/components/status-pill";
import { pingSiteAction, toggleSiteAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatLatency } from "@/lib/format";
import {
  getSiteForUser, getSiteLogsForUser, getSiteStatsForUser, getSiteDailyStatsForUser, siteProbePath
} from "@/lib/sites";

export const dynamic = "force-dynamic";

export default async function SiteDetailPage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const site = await getSiteForUser(user.id, id);
  if (!site) notFound();
  const [logs, stats, daily] = await Promise.all([
    getSiteLogsForUser(user.id, id),
    getSiteStatsForUser(user.id),
    getSiteDailyStatsForUser(user.id, id)
  ]);
  const metrics = stats.find(item => item.site_id === site.id);
  const availability = metrics?.checks
    ? ((metrics.successful / metrics.checks) * 100).toFixed(1) + "%"
    : "—";
  const maxLatency = Math.max(1, ...daily.map(item => Number(item.avg_latency_ms || 0)));
  return (
    <AppShell user={user}>
      <section className="page-header compact">
        <div>
          <Link className="back-link" href="/dashboard">← Voltar ao painel</Link>
          <p className="eyebrow">Site hospedado na Vercel</p>
          <div className="title-with-status">
            <h1>{site.name}</h1>
            <StatusPill status={site.last_status} enabled={site.enabled} />
          </div>
          <p className="mono-url">{site.site_url}{siteProbePath(site.site_url)} — GET sem login</p>
        </div>
        <div className="header-actions">
          <form action={pingSiteAction}>
            <input type="hidden" name="site_id" value={site.id} />
            <button className="button button-primary">Testar agora</button>
          </form>
          <form action={toggleSiteAction}>
            <input type="hidden" name="site_id" value={site.id} />
            <button className="button button-secondary">
              {site.enabled ? "Pausar automação" : "Ativar automação"}
            </button>
          </form>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>Última verificação</span>
          <strong className="metric-text">{formatDate(site.last_check_at)}</strong>
          <small>{site.last_http_status ? "HTTP " + site.last_http_status : "sem HTTP"}</small>
        </article>
        <article className="metric-card">
          <span>Resposta mais recente</span>
          <strong>{formatLatency(site.last_latency_ms)}</strong>
          <small>tempo da entrada pública</small>
        </article>
        <article className="metric-card">
          <span>Latência média — 7 dias</span>
          <strong>{formatLatency(metrics?.avg_latency_ms)}</strong>
          <small>somente testes online</small>
        </article>
        <article className="metric-card">
          <span>Disponibilidade observada — 7 dias</span>
          <strong>{availability}</strong>
          <small>{metrics?.checks || 0} verificações</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Histórico de desempenho</p>
            <h2>Latência média diária dos últimos 7 dias</h2>
          </div>
          <span className="muted-text">Testes HTTP, não velocidade de renderização</span>
        </div>
        {daily.length ? (
          <div className="latency-chart" aria-label="Médias de latência por dia">
            {daily.map(item => (
              <div className="latency-day" key={String(item.day)}>
                <span className="latency-number">{formatLatency(item.avg_latency_ms)}</span>
                <div className="latency-rail">
                  <span
                    className="latency-bar"
                    style={{ height: item.avg_latency_ms ? Math.max(5, Math.round(Number(item.avg_latency_ms) / maxLatency * 100)) + "%" : "0%" }}
                  />
                </div>
                <small>{new Date(item.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}</small>
              </div>
            ))}
          </div>
        ) : <p className="muted-text">O gráfico aparecerá após as primeiras verificações.</p>}
      </section>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Auditoria</p>
            <h2>Últimas 40 verificações</h2>
          </div>
        </div>
        <p className="muted-text">Para MAE APS e Gestário, somente HTTP 200 com JSON de saúde válido conta como Online. Redirecionamentos ou bloqueios aparecem como Protegido. O teste não acessa áreas restritas nem verifica o carregamento visual.</p>
        {logs.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Quando</th><th>Status</th><th>Origem</th><th>HTTP</th><th>Latência</th><th>Detalhe</th></tr></thead>
              <tbody>
                {logs.map((log, index) => (
                  <tr key={index}>
                    <td>{formatDate(log.created_at)}</td>
                    <td><StatusPill status={log.status}/></td>
                    <td>{log.source === "manual" ? "Manual" : "Automático"}</td>
                    <td>{log.http_status || "—"}</td>
                    <td>{formatLatency(log.latency_ms)}</td>
                    <td className="log-detail">{log.error_message || "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted-text">Nenhuma verificação registrada ainda.</p>}
      </section>
    </AppShell>
  );
}
