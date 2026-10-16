"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, loginUser, logoutUser, registerUser } from "@/lib/auth";
import { encryptValue } from "@/lib/crypto";
import { db } from "@/lib/db";
import { normalizeSiteUrl, getSiteForUser, pingAndRecordSite } from "@/lib/sites";
import { getProjectForUser, pingAndRecord } from "@/lib/keeper";
import {
  normalizeProjectUrl,
  validateProjectName,
  validatePublishableKey
} from "@/lib/validators";

function messageOf(error) {
  return error instanceof Error ? error.message : "Ocorreu um erro inesperado.";
}

function withError(path, message) {
  return `${path}?error=${encodeURIComponent(message)}`;
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function loginAction(formData) {
  let errorMessage = null;

  try {
    await loginUser({
      email: formData.get("email"),
      password: formData.get("password")
    });
  } catch (error) {
    errorMessage = messageOf(error);
  }

  if (errorMessage) redirect(withError("/login", errorMessage));
  redirect("/dashboard");
}

export async function registerAction(formData) {
  let errorMessage = null;

  try {
    await registerUser({
      email: formData.get("email"),
      password: formData.get("password"),
      signupCode: formData.get("signup_code")
    });
  } catch (error) {
    errorMessage = messageOf(error);
  }

  if (errorMessage) redirect(withError("/register", errorMessage));
  redirect("/dashboard");
}

export async function logoutAction() {
  await logoutUser();
  redirect("/login");
}

export async function createProjectAction(formData) {
  const user = await requireUser();
  let project;
  let errorMessage = null;

  try {
    const name = validateProjectName(formData.get("name"));
    const projectUrl = normalizeProjectUrl(formData.get("project_url"));
    const publishableKey = validatePublishableKey(formData.get("publishable_key"));
    const sql = db();

    let rows;
    try {
      rows = await sql`
        insert into keeper_projects (
          user_id,
          name,
          project_url,
          key_ciphertext
        )
        values (
          ${user.id},
          ${name},
          ${projectUrl},
          ${encryptValue(publishableKey)}
        )
        returning *
      `;
    } catch (error) {
      if (error?.code === "23505") {
        throw new Error("Este projeto já está cadastrado na sua conta.");
      }
      throw new Error("Não foi possível cadastrar o projeto.");
    }

    project = rows[0];

    try {
      await pingAndRecord(project, "manual");
    } catch {
      // O cadastro permanece válido. O próximo teste pode ser feito pelo painel.
    }
  } catch (error) {
    errorMessage = messageOf(error);
  }

  if (errorMessage) redirect(withError("/projects/new", errorMessage));
  revalidatePath("/dashboard");
  redirect(`/projects/${project.id}`);
}

export async function pingProjectAction(formData) {
  const user = await requireUser();
  const projectId = String(formData.get("project_id") || "");
  const project = await getProjectForUser(user.id, projectId);

  if (!project) redirect("/dashboard");

  try {
    await pingAndRecord(project, "manual");
  } catch {
    // O erro operacional é registrado no painel quando possível.
  }

  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
}

export async function toggleProjectAction(formData) {
  const user = await requireUser();
  const projectId = String(formData.get("project_id") || "");
  const project = await getProjectForUser(user.id, projectId);

  if (!project) redirect("/dashboard");

  const sql = db();
  await sql`
    update keeper_projects
    set
      enabled = ${!project.enabled},
      updated_at = now()
    where id = ${project.id}
      and user_id = ${user.id}
  `;

  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProjectAction(formData) {
  const user = await requireUser();
  const projectId = String(formData.get("project_id") || "");
  const project = await getProjectForUser(user.id, projectId);

  if (!project) redirect("/dashboard");

  let errorMessage = null;

  try {
    const name = validateProjectName(formData.get("name"));
    const projectUrl = normalizeProjectUrl(formData.get("project_url"));
    const newKeyRaw = String(formData.get("publishable_key") || "").trim();
    const sql = db();

    if (newKeyRaw) {
      const encryptedKey = encryptValue(validatePublishableKey(newKeyRaw));

      await sql`
        update keeper_projects
        set
          name = ${name},
          project_url = ${projectUrl},
          key_ciphertext = ${encryptedKey},
          updated_at = now()
        where id = ${project.id}
          and user_id = ${user.id}
      `;
    } else {
      await sql`
        update keeper_projects
        set
          name = ${name},
          project_url = ${projectUrl},
          updated_at = now()
        where id = ${project.id}
          and user_id = ${user.id}
      `;
    }
  } catch (error) {
    errorMessage = messageOf(error);
  }

  if (errorMessage) {
    redirect(withError(`/projects/${projectId}`, errorMessage));
  }

  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?saved=1`);
}

export async function deleteProjectAction(formData) {
  const user = await requireUser();
  const projectId = String(formData.get("project_id") || "");
  const project = await getProjectForUser(user.id, projectId);

  if (!project) redirect("/dashboard");

  const sql = db();
  await sql`
    delete from keeper_projects
    where id = ${project.id}
      and user_id = ${user.id}
  `;

  revalidatePath("/dashboard");
  redirect("/dashboard?deleted=1");
}


export async function createSiteAction(formData) {
  const user = await requireUser();
  let site;
  let errorMessage;
  try {
    const name = validateProjectName(formData.get("name"));
    const siteUrl = normalizeSiteUrl(formData.get("site_url"));
    const sql = db();
    const rows = await sql`
      insert into keeper_sites (user_id, name, site_url)
      values (${user.id}, ${name}, ${siteUrl})
      returning *
    `;
    site = rows[0];
    try { await pingAndRecordSite(site, "manual"); } catch {
      // Keep the site registered so the next scheduled check can retry.
    }
  } catch (error) {
    errorMessage = error?.code === "23505"
      ? "Este site já está cadastrado na sua conta."
      : messageOf(error);
  }
  if (errorMessage) redirect(withError("/sites/new", errorMessage));
  revalidatePath("/dashboard");
  redirect("/sites/" + site.id);
}

export async function pingSiteAction(formData) {
  const user = await requireUser();
  const siteId = String(formData.get("site_id") || "");
  const site = await getSiteForUser(user.id, siteId);
  if (!site) redirect("/dashboard");
  try { await pingAndRecordSite(site, "manual"); } catch {
    // Keep the last known status; infrastructure failures are not exposed to browsers.
  }
  revalidatePath("/dashboard");
  revalidatePath("/sites/" + siteId);
}

export async function toggleSiteAction(formData) {
  const user = await requireUser();
  const siteId = String(formData.get("site_id") || "");
  const site = await getSiteForUser(user.id, siteId);
  if (!site) redirect("/dashboard");
  const sql = db();
  await sql`
    update keeper_sites set enabled = ${!site.enabled}, updated_at = now()
    where id = ${siteId} and user_id = ${user.id}
  `;
  revalidatePath("/dashboard");
  revalidatePath("/sites/" + siteId);
}
