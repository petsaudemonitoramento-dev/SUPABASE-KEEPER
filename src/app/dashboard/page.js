import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import StatusPill from "@/components/status-pill";
import { TimelineGraph } from "@/components/site-graphs";
import { pingProjectAction, toggleProjectAction, pingSiteAction, toggleSiteAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatLatency, projectRefFromUrl } from "@/lib/format";
import { getProjectsForUser } from "@/lib/keeper";
import { getSitesForUser, getProjectStatsForUser, getSiteStatsForUser, getSitesTrendForUser, siteProbePath } from "@/lib/sites";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const query = await searchParams;
  const days = query?.period === "30" ? 30 : 7;
  const [projects, sites, dbStats, siteStats, siteTrend] = await Promise.all([
    getProjectsForUser(user.id),
    getSitesForUser(user.id),
    getProjectStatsForUser(user.id),
    getSiteStatsForUser(user.id),
    getSitesTrendForUser(user.id, days)
  ]);
  const dbStatById = new Map(dbStats.map(item => [item.project_id, item]));
  const siteStatById = new Map(siteStats.map(item => [item.site_id, item]));
  const graphSeries = sites.map(site => ({
    name: site.name,
    readings: siteTrend.filter(item => item.site_id === site.id && item.median_ms !== null)
      .map(item => ({ at: item.created_at, ms: item.median_ms }))
  }));

  const active = projects.filter((project) => project.enabled);
  const online = active.filter((project) => project.last_status === "online").length;
  const errors = active.filter((project) => project.last_status === "error").length;

  return (
    <AppShell user={user}>
      <section className="page-header">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Projetos monitorados</h1>
          <p>
            Bancos Supabase e sites Vercel separados. Sites: 2 rodadas automáticas por dia, com 3 testes por rodada.
          </p>
        </div>
        <Link className="button button-primary" href="/projects/new">
          + Adicionar projeto
        </Link>
      </section>

      {query?.deleted ? (
        <div className="alert alert-success">Projeto removido do Keeper.</div>
      ) : null}

      <section className="metrics-grid">
        <article className="metric-card">
          <span>Total</span>
          <strong>{projects.length}</strong>
          <small>projetos cadastrados</small>
        </article>
        <article className="metric-card">
          <span>Ativos</span>
          <strong>{active.length}</strong>
          <small>participam do próximo ciclo</small>
        </article>
        <article className="metric-card">
          <span>Online</span>
          <strong>{online}</strong>
          <small>último teste concluído</small>
        </article>
        <article className="metric-card">
          <span>Com erro</span>
          <strong>{errors}</strong>
          <small>detalhes somente no painel</small>
        </article>
      </section>

      {projects.length === 0 ? (
        <section className="empty-state">
          <div className="empty-icon">K</div>
          <h2>Nenhum Supabase cadastrado ainda</h2>
          <p>
            Adicione o primeiro projeto. O Keeper testará a conexão imediatamente e depois seguirá
            o agendamento automático.
          </p>
          <Link className="button button-primary" href="/projects/new">
            Cadastrar primeiro projeto
          </Link>
        </section>
      ) : (
        <section className="projects-list">
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="project-main">
                <div className="project-title-row">
                  <div>
                    <Link className="project-name" href={`/projects/${project.id}`}>
                      {project.name}
                    </Link>
                    <span className="project-ref">{projectRefFromUrl(project.project_url)}</span>
                  </div>
                  <StatusPill status={project.last_status} enabled={project.enabled} />
                </div>

                <div className="project-stats">
                  <div>
                    <span>Último ping</span>
                    <strong>{formatDate(project.last_ping_at)}</strong>
                  </div>
                  <div>
                    <span>Latência</span>
                    <strong>{formatLatency(project.last_latency_ms)}</strong>
                  </div>
                  <div>
                    <span>Média 7 dias</span>
                    <strong>{formatLatency(dbStatById.get(project.id)?.avg_latency_ms)}</strong>
                  </div>
                  <div>
                    <span>Disponibilidade 7 dias</span>
                    <strong>{dbStatById.get(project.id)?.checks
                      ? ((dbStatById.get(project.id).successful / dbStatById.get(project.id).checks) * 100).toFixed(1) + "%"
                      : "—"}</strong>
                  </div>
                  <div>
                    <span>Falhas seguidas</span>
                    <strong>{project.consecutive_failures}</strong>
                  </div>
                </div>

                {project.last_status === "error" && project.last_error ? (
                  <p className="inline-error">{project.last_error}</p>
                ) : null}
              </div>

              <div className="project-actions">
                <form action={pingProjectAction}>
                  <input type="hidden" name="project_id" value={project.id} />
                  <button className="button button-secondary button-small" type="submit">
                    Testar agora
                  </button>
                </form>
                <form action={toggleProjectAction}>
                  <input type="hidden" name="project_id" value={project.id} />
                  <button className="button button-ghost button-small" type="submit">
                    {project.enabled ? "Pausar" : "Ativar"}
                  </button>
                </form>
                <Link className="button button-ghost button-small" href={`/projects/${project.id}`}>
                  Detalhes
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}


      <section className="sites-header">
        <div>
          <p className="eyebrow">Monitoramento HTTP</p>
          <h2>Sites Vercel</h2>
          <p>Tempo de resposta da entrada pública. O teste não entra em contas ou páginas protegidas.</p>
        </div>
        <Link className="button button-secondary" href="/sites/new">+ Adicionar site</Link>
      </section>

      {sites.length === 0 ? (
        <section className="panel"><p>Nenhum site cadastrado ainda.</p></section>
      ) : (
        <section className="projects-list">
          {sites.map(site => {
            const stats = siteStatById.get(site.id);
            return (
              <article className="project-card" key={site.id}>
                <div className="project-main">
                  <div className="project-title-row">
                    <div>
                      <Link className="project-name" href={"/sites/" + site.id}>{site.name}</Link>
                      <span className="project-ref">{site.site_url}</span>
                      <span className="project-ref" style={{display: "block", marginTop: 5}}>GET {siteProbePath(site.site_url)}</span>
                    </div>
                    <StatusPill status={site.last_status} enabled={site.enabled} />
                  </div>
                  <div className="project-stats">
                    <div><span>Último teste</span><strong>{formatDate(site.last_check_at)}</strong></div>
                    <div><span>Mediana da última rodada</span><strong>{formatLatency(siteStatById.get(site.id)?.checks ? site.last_latency_ms : null)}</strong></div>
                    <div><span>Média das medianas · 7 dias</span><strong>{formatLatency(stats?.avg_latency_ms)}</strong></div>
                    <div><span>Disponibilidade observada · 7 dias</span><strong>{
                      stats?.checks ? ((stats.successful / stats.checks) * 100).toFixed(1) + "%" : "—"
                    }</strong><small>{stats?.checks || 0} rodadas</small></div>
                  </div>
                </div>
                <div className="project-actions">
                  <form action={pingSiteAction}>
                    <input type="hidden" name="site_id" value={site.id}/>
                    <button className="button button-secondary button-small">Testar agora · 3x</button>
                  </form>
                  <form action={toggleSiteAction}>
                    <input type="hidden" name="site_id" value={site.id}/>
                    <button className="button button-ghost button-small">{site.enabled ? "Pausar" : "Ativar"}</button>
                  </form>
                  <Link className="button button-ghost button-small" href={"/sites/" + site.id}>Detalhes</Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
      <p className="muted-text" style={{marginTop: 12}}>
        MAE APS e Gestário utilizam uma rota pública de saúde com resposta JSON validada. Redirecionamentos nessa rota aparecem como Protegido. Outros sites ainda podem usar a verificação da raiz.
        As taxas de disponibilidade representam somente rodadas observadas (pelo menos 2 de 3 respostas saudáveis); histórico de testes únicos permanece separado.
      </p>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Comparativo Vercel</p>
            <h2>Evolução da mediana por rodada</h2>
          </div>
          <div className="period-selector">
            <Link href="/dashboard?period=7" className={days === 7 ? "period-active" : ""}>7 dias</Link>
            <Link href="/dashboard?period=30" className={days === 30 ? "period-active" : ""}>30 dias</Link>
          </div>
        </div>
        <TimelineGraph days={days} series={graphSeries}/>
      </section>

      <section className="quiet-note">
        <strong>Modo silencioso</strong>
        <span>
          Erros de um projeto não derrubam o ciclo e não disparam e-mail. Eles ficam registrados
          no histórico para você consultar quando quiser.
        </span>
      </section>
    </AppShell>
  );
}
