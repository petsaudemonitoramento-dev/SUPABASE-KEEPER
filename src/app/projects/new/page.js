import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import CopyButton from "@/components/copy-button";
import { createProjectAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

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

export default async function NewProjectPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const query = await searchParams;

  return (
    <AppShell user={user}>
      <section className="page-header compact">
        <div>
          <Link className="back-link" href="/dashboard">← Voltar</Link>
          <p className="eyebrow">Novo projeto</p>
          <h1>Cadastrar Supabase</h1>
          <p>Primeiro instale a função de keep-alive no Supabase. Depois cadastre e teste.</p>
        </div>
      </section>

      <div className="content-grid">
        <section className="panel">
          <p className="eyebrow">Passo 2</p>
          <h2>Dados do projeto</h2>

          {query?.error ? <div className="alert alert-error">{query.error}</div> : null}

          <form action={createProjectAction} className="form-stack">
            <label>
              <span>Nome</span>
              <input name="name" placeholder="Ex.: Petita" maxLength="80" required />
            </label>

            <label>
              <span>Project URL</span>
              <input
                name="project_url"
                type="url"
                placeholder="https://xxxxxxxx.supabase.co"
                required
              />
              <small>Use a URL oficial do projeto Supabase.</small>
            </label>

            <label>
              <span>Publishable Key</span>
              <input
                name="publishable_key"
                type="password"
                placeholder="sb_publishable_..."
                autoComplete="off"
                required
              />
              <small>
                Nunca use service_role ou secret key. A Publishable Key será criptografada antes de
                ser armazenada.
              </small>
            </label>

            <button className="button button-primary" type="submit">
              Já instalei o SQL — cadastrar e testar
            </button>
          </form>
        </section>

        <aside className="panel panel-muted">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Passo 1</p>
              <h2>Instalar keeper_ping()</h2>
            </div>
            <CopyButton text={TARGET_SQL} />
          </div>

          <p>
            Antes de cadastrar, abra o <strong>SQL Editor</strong> do Supabase que será monitorado,
            cole este SQL e execute uma vez.
          </p>

          <pre className="code-block"><code>{TARGET_SQL}</code></pre>

          <p className="muted-text">
            A função usa <strong>SECURITY INVOKER</strong>, não lê nenhuma tabela e retorna apenas
            <code> true</code>. Depois volte aqui e clique em cadastrar e testar.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
