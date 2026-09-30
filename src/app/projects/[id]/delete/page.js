import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { deleteProjectAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/keeper";

export default async function DeleteProjectPage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const project = await getProjectForUser(user.id, id);
  if (!project) notFound();

  return (
    <AppShell user={user}>
      <section className="confirm-card">
        <p className="eyebrow">Confirmação</p>
        <h1>Excluir {project.name}?</h1>
        <p>
          Isso remove somente o cadastro e o histórico do Keeper. Nenhum dado do projeto Supabase
          será apagado ou alterado.
        </p>
        <div className="confirm-actions">
          <Link className="button button-secondary" href={`/projects/${project.id}`}>
            Cancelar
          </Link>
          <form action={deleteProjectAction}>
            <input type="hidden" name="project_id" value={project.id} />
            <button className="button button-danger" type="submit">
              Sim, excluir do Keeper
            </button>
          </form>
        </div>
      </section>
    </AppShell>
  );
}
