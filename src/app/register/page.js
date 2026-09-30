import Link from "next/link";
import { redirect } from "next/navigation";
import { registerAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

export default async function RegisterPage({ searchParams }) {
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
            <small>cadastro controlado por convite</small>
          </span>
        </div>

        <div className="auth-heading">
          <p className="eyebrow">Cadastro</p>
          <h1>Criar conta</h1>
          <p>Novas contas só entram com o código definido pelo administrador.</p>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form action={registerAction} className="form-stack">
          <label>
            <span>E-mail</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            <span>Senha</span>
            <input name="password" type="password" minLength="12" autoComplete="new-password" required />
            <small>Mínimo de 12 caracteres.</small>
          </label>
          <label>
            <span>Código de convite</span>
            <input name="signup_code" type="password" autoComplete="off" required />
          </label>
          <button className="button button-primary button-full" type="submit">
            Criar conta
          </button>
        </form>

        <p className="auth-footer">
          Já possui conta? <Link href="/login">Entrar</Link>
        </p>
      </section>
    </main>
  );
}
