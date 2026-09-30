import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">404</p>
        <h1>Projeto não encontrado</h1>
        <p>Esse item não existe ou não pertence à sua conta do Keeper.</p>
        <Link className="button button-primary button-full" href="/dashboard">
          Voltar ao painel
        </Link>
      </section>
    </main>
  );
}
