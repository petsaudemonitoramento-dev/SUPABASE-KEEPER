import Link from "next/link";
import { logoutAction } from "@/app/actions";

export default function AppShell({ user, children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">K</span>
          <span>
            <strong>Supabase Keeper</strong>
            <small>keep-alive sem ruído</small>
          </span>
        </Link>

        <div className="topbar-actions">
          <span className="account-email">{user.email}</span>
          <form action={logoutAction}>
            <button className="button button-ghost button-small" type="submit">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}
