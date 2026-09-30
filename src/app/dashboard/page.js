import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import StatusPill from "@/components/status-pill";
import { pingProjectAction, toggleProjectAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatLatency, projectRefFromUrl } from "@/lib/format";
import { getProjectsForUser } from "@/lib/keeper";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const projects = await getProjectsForUser(user.id);
  const query = await searchParams;

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
            Dois ciclos por dia, uma consulta mínima por projeto e nenhum e-mail automático.
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
