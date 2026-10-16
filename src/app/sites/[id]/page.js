import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import StatusPill from "@/components/status-pill";
import { TimelineGraph, ProbeBars } from "@/components/site-graphs";
import { pingSiteAction, toggleSiteAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatLatency } from "@/lib/format";
import {
  getSiteForUser, getSiteLogsForUser, getSiteStatsForUser,
  getSiteRoundsForUser, getSiteTrendForUser, siteProbePath
} from "@/lib/sites";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function availability(stats) {
  return stats?.checks ? ((stats.successful / stats.checks) * 100).toFixed(1) + "%" : "—";
}

export default async function SiteDetailPage({ params, searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const days = query?.period === "30" ? 30 : 7;
  const site = await getSiteForUser(user.id, id);
  if (!site) notFound();

  const [legacyLogs, stats7, stats30, rounds, trend] = await Promise.all([
    getSiteLogsForUser(user.id, id),
    getSiteStatsForUser(user.id, 7),
    getSiteStatsForUser(user.id, 30),
    getSiteRoundsForUser(user.id, id, 40),
    getSiteTrendForUser(user.id, id, days)
  ]);
  const recent = rounds[0];
  const seven = stats7.find(item => item.site_id === site.id);
  const thirty = stats30.find(item => item.site_id === site.id);

  return (
    <AppShell user={user}>
      <section className="page-header compact">
        <div>
          <Link className="back-link" href="/dashboard">← Voltar ao painel</Link>
          <p className="eyebrow">Monitoramento HTTP · Vercel</p>
          <div className="title-with-status">
            <h1>{site.name}</h1>
            <StatusPill status={site.last_status} enabled={site.enabled}/>
          </div>
          <p className="mono-url">{site.site_url}{siteProbePath(site.site_url)} — GET sem login</p>
        </div>
        <div className="header-actions">
          <form action={pingSiteAction}>
            <input type="hidden" name="site_id" value={site.id}/>
            <button className="button button-primary">Testar agora · 3x</button>
          </form>
          <form action={toggleSiteAction}>
            <input type="hidden" name="site_id" value={site.id}/>
            <button className="button button-secondary">
              {site.enabled ? "Pausar automação" : "Ativar automação"}
            </button>
          </form>
        </div>
      </section>
      <p className="muted-text">Duas rodadas automáticas por dia. Cada rodada executa três verificações, separadas por 5 segundos. A mediana dos testes bem-sucedidos representa a latência; 2/3 respostas OK mantém o status online, com a instabilidade sinalizada.</p>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>Última rodada</span>
          <strong className="metric-text">{formatDate(recent?.created_at)}</strong>
          <small>{recent?.source === "manual" ? "Manual" : recent ? "Automática" : "aguardando rodada"}</small>
        </article>
        <article className="metric-card">
          <span>Mediana da última rodada</span>
          <strong>{formatLatency(recent?.median_ms)}</strong>
          <small>{recent ? recent.success_count + " de 3 testes OK" : "sem rodadas completas"}</small>
        </article>
        <article className="metric-card">
          <span>Média das medianas · 7 dias</span>
          <strong>{formatLatency(seven?.avg_latency_ms)}</strong>
          <small>{seven?.checks || 0} rodadas observadas</small>
        </article>
        <article className="metric-card">
          <span>Disponibilidade observada · 7 dias</span>
          <strong>{availability(seven)}</strong>
          <small>{seven?.fully_healthy || 0} rodadas 3/3 OK</small>
        </article>
      </section>

      {recent ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Três medições</p>
              <h2>Última rodada · {formatDate(recent.created_at)}</h2>
            </div>
            <StatusPill status={recent.status}/>
          </div>
          <ProbeBars samples={recent.samples}/>
          <div className="round-summary">
            <span>Mediana: <strong>{formatLatency(recent.median_ms)}</strong></span>
            <span>Média: <strong>{formatLatency(recent.mean_ms)}</strong></span>
            <span>Mínimo: <strong>{formatLatency(recent.min_ms)}</strong></span>
            <span>Máximo: <strong>{formatLatency(recent.max_ms)}</strong></span>
          </div>
          {recent.error_message ? <p className="inline-error">{recent.error_message}</p> : null}
        </section>
      ) : null}

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Evolução de desempenho</p>
            <h2>Latência representativa por rodada</h2>
          </div>
          <div className="period-selector">
            <Link href={`/sites/${site.id}?period=7`} className={days === 7 ? "period-active" : ""}>7 dias</Link>
            <Link href={`/sites/${site.id}?period=30`} className={days === 30 ? "period-active" : ""}>30 dias</Link>
          </div>
        </div>
        <TimelineGraph days={days} series={[{
          name: site.name, readings: trend.map(item => ({at: item.created_at,ms: item.median_ms}))
            .filter(item => item.ms !== null)
        }]}/>
      </section>

      <section className="metrics-grid history-panel">
        <article className="metric-card"><span>Rodadas · 7 dias</span><strong>{seven?.checks || 0}</strong><small>até duas automáticas por dia</small></article>
        <article className="metric-card"><span>Disponibilidade · 30 dias</span><strong>{availability(thirty)}</strong><small>{thirty?.checks || 0} rodadas observadas</small></article>
        <article className="metric-card"><span>Média das medianas · 30 dias</span><strong>{formatLatency(thirty?.avg_latency_ms)}</strong><small>somente rodadas online</small></article>
        <article className="metric-card"><span>Maior tempo individual · 30 dias</span><strong>{formatLatency(thirty?.max_latency_ms)}</strong><small>inclui amostras online</small></article>
      </section>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Auditoria de rodadas</p><h2>Últimas 40 rodadas (3 testes cada)</h2></div>
        </div>
        {rounds.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Status</th><th>Origem</th><th>Testes OK</th><th>1º</th><th>2º</th><th>3º</th><th>Mediana</th><th>Média</th></tr></thead>
              <tbody>{rounds.map(item => (
                <tr key={item.id}>
                  <td>{formatDate(item.created_at)}</td>
                  <td><StatusPill status={item.status}/></td>
                  <td>{item.source === "manual" ? "Manual" : "Automático"}</td>
                  <td>{item.success_count}/3</td>
                  {[0,1,2].map(index => (
                    <td key={index} title={item.samples?.[index]?.error || ""}>
                      {formatLatency(item.samples?.[index]?.latencyMs)}
                    </td>
                  ))}
                  <td><strong>{formatLatency(item.median_ms)}</strong></td>
                  <td>{formatLatency(item.mean_ms)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted-text">Ainda não existe nenhuma rodada de três medições.</p>}
      </section>

      {legacyLogs.length ? (
        <section className="panel history-panel">
          <p className="eyebrow">Antes da atualização</p>
          <h2>Histórico preservado de testes únicos</h2>
          <p className="muted-text">Estes testes continuam disponíveis, mas não são misturados com as médias e gráficos das novas rodadas.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>Quando</th><th>Status</th><th>HTTP</th><th>Latência</th></tr></thead>
            <tbody>{legacyLogs.map((log,index)=><tr key={index}>
              <td>{formatDate(log.created_at)}</td><td><StatusPill status={log.status}/></td>
              <td>{log.http_status || "—"}</td><td>{formatLatency(log.latency_ms)}</td>
            </tr>)}</tbody>
          </table></div>
        </section>
      ) : null}
      <p className="muted-text">Os gráficos representam a resposta da rota pública de saúde, não a velocidade de renderização ou as áreas autenticadas do sistema. Disponibilidade significa somente a proporção das rodadas observadas com ao menos 2 respostas saudáveis em 3.</p>
    </AppShell>
  );
}
