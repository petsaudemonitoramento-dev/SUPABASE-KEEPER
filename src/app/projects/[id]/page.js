import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import CopyButton from "@/components/copy-button";
import StatusPill from "@/components/status-pill";
import {
  pingProjectAction,
  toggleProjectAction,
  updateProjectAction
} from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatLatency, projectRefFromUrl } from "@/lib/format";
import { getLogsForUser, getProjectForUser } from "@/lib/keeper";

const TARGET_SQL = `create or replace function public.keeper_ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.keeper_ping() from public;
grant execute on function public.keeper_ping() to anon, authenticated;`;

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const query = await searchParams;
  const project = await getProjectForUser(user.id, id);

  if (!project) notFound();

  const logs = await getLogsForUser(user.id, id);

  return (
    <AppShell user={user}>
      <section className="page-header compact">
        <div>
          <Link className="back-link" href="/dashboard">← Voltar ao painel</Link>
          <div className="title-with-status">
            <div>
              <p className="eyebrow">{projectRefFromUrl(project.project_url)}</p>
              <h1>{project.name}</h1>
            </div>
            <StatusPill status={project.last_status} enabled={project.enabled} />
          </div>
          <p className="mono-url">{project.project_url}</p>
        </div>

        <div className="header-actions">
          <form action={pingProjectAction}>
            <input type="hidden" name="project_id" value={project.id} />
            <button className="button button-primary" type="submit">Testar agora</button>
          </form>
          <form action={toggleProjectAction}>
            <input type="hidden" name="project_id" value={project.id} />
            <button className="button button-secondary" type="submit">
              {project.enabled ? "Pausar automação" : "Ativar automação"}
            </button>
          </form>
        </div>
      </section>

      {query?.error ? <div className="alert alert-error">{query.error}</div> : null}
      {query?.saved ? <div className="alert alert-success">Alterações salvas.</div> : null}

      <section className="metrics-grid">
        <article className="metric-card">
          <span>Último ping</span>
          <strong className="metric-text">{formatDate(project.last_ping_at)}</strong>
          <small>{project.last_http_status ? `HTTP ${project.last_http_status}` : "sem resposta HTTP"}</small>
        </article>
        <article className="metric-card">
          <span>Último sucesso</span>
          <strong className="metric-text">{formatDate(project.last_success_at)}</strong>
          <small>última confirmação online</small>
        </article>
        <article className="metric-card">
          <span>Latência</span>
          <strong>{formatLatency(project.last_latency_ms)}</strong>
          <small>requisição mínima</small>
        </article>
        <article className="metric-card">
          <span>Falhas seguidas</span>
          <strong>{project.consecutive_failures}</strong>
          <small>sem alertas por e-mail</small>
        </article>
      </section>

      {project.last_status === "error" && project.last_error ? (
        <div className="alert alert-error">
          <strong>Último erro:</strong> {project.last_error}
        </div>
      ) : null}

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Configuração do destino</p>
              <h2>Função de keep-alive</h2>
            </div>
            <CopyButton text={TARGET_SQL} />
          </div>
          <p>
            Execute uma vez este SQL no SQL Editor do projeto que será mantido ativo. A função é
            <strong> SECURITY INVOKER</strong>, não lê tabelas e retorna somente <code>true</code>.
          </p>
          <pre className="code-block"><code>{TARGET_SQL}</code></pre>
        </section>

        <section className="panel">
          <p className="eyebrow">Editar</p>
          <h2>Configurações do projeto</h2>
          <form action={updateProjectAction} className="form-stack">
            <input type="hidden" name="project_id" value={project.id} />
            <label>
              <span>Nome</span>
              <input name="name" defaultValue={project.name} maxLength="80" required />
            </label>
            <label>
              <span>Project URL</span>
              <input name="project_url" type="url" defaultValue={project.project_url} required />
            </label>
            <label>
              <span>Nova Publishable Key</span>
              <input name="publishable_key" type="password" placeholder="Deixe vazio para manter a atual" />
            </label>
            <button className="button button-secondary" type="submit">Salvar alterações</button>
          </form>

          <div className="danger-zone">
            <span>Não quer mais monitorar este banco?</span>
            <Link className="danger-link" href={`/projects/${project.id}/delete`}>
              Excluir do Keeper
            </Link>
          </div>
        </section>
      </div>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Histórico</p>
            <h2>Últimos pings</h2>
          </div>
          <span className="muted-text">até 40 registros</span>
        </div>

        {logs.length === 0 ? (
          <p className="muted-text">Nenhum ping registrado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Status</th>
                  <th>Origem</th>
                  <th>HTTP</th>
                  <th>Latência</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.created_at)}</td>
                    <td><StatusPill status={log.status} /></td>
                    <td>{log.source === "manual" ? "Manual" : "Automático"}</td>
                    <td>{log.http_status || "—"}</td>
                    <td>{formatLatency(log.latency_ms)}</td>
                    <td className="log-detail">{log.error_message || "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
