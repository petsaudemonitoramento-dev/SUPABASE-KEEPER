import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { createSiteAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

export default async function NewSitePage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  return (
    <AppShell user={user}>
      <section className="page-header compact">
        <div>
          <Link href="/dashboard" className="back-link">← Voltar ao painel</Link>
          <p className="eyebrow">Monitoramento leve de sites</p>
          <h1>Adicionar site Vercel</h1>
          <p>Verificamos apenas a entrada HTTPS pública, sem login, dados pessoais ou recursos restritos.</p>
        </div>
      </section>
      <section className="panel" style={{ maxWidth: 650 }}>
        {query?.error ? <div className="alert alert-error">{query.error}</div> : null}
        <form action={createSiteAction} className="form-stack">
          <label>
            <span>Nome do site</span>
            <input type="text" name="name" maxLength="80" placeholder="Ex.: MAE APS" required />
          </label>
          <label>
            <span>URL do domínio Vercel</span>
            <input type="url" name="site_url" placeholder="https://meusite.vercel.app" required />
            <small>Somente HTTPS *.vercel.app, sem caminho ou parâmetros.</small>
          </label>
          <button className="button button-primary" type="submit">Cadastrar e testar</button>
        </form>
      </section>
    </AppShell>
  );
}
