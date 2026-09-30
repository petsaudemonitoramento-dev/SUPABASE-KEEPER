import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage({ searchParams }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const query = await searchParams;
  const error = query?.error;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand brand-auth">
          <span className="brand-mark">K</span>
          <span>
            <strong>Supabase Keeper</strong>
            <small>seus projetos acordados, sem flood</small>
          </span>
        </div>

        <div className="auth-heading">
          <p className="eyebrow">Acesso</p>
          <h1>Entrar no painel</h1>
          <p>O Keeper faz apenas pings mínimos e registra os erros aqui.</p>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form action={loginAction} className="form-stack">
          <label>
            <span>E-mail</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            <span>Senha</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="button button-primary button-full" type="submit">
            Entrar
          </button>
        </form>

        <p className="auth-footer">
          Primeiro acesso? <Link href="/register">Criar conta com código de convite</Link>
        </p>
      </section>
    </main>
  );
}
