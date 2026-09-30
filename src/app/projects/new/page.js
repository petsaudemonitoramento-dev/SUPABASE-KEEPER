import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { createProjectAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

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
          <p>O repositório GitHub do projeto não importa. O Keeper acessa apenas a API do Supabase.</p>
        </div>
      </section>

      <div className="content-grid">
        <section className="panel">
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
              Cadastrar e testar
            </button>
          </form>
        </section>

        <aside className="panel panel-muted">
          <p className="eyebrow">Como funciona</p>
          <h2>Sem vínculo com GitHub</h2>
          <p>
            O código do seu projeto pode estar em outra conta, organização, GitLab ou nem existir.
            Para o Keeper, cada banco é apenas um endpoint Supabase independente.
          </p>
          <div className="mini-flow">
            <span>Keeper</span><b>→</b><span>REST/RPC</span><b>→</b><span>Postgres</span>
          </div>
          <p className="muted-text">
            Após cadastrar, a página de detalhes mostra o SQL de instalação da função
            <code> keeper_ping()</code>. Ela executa somente <code>select true</code>.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
