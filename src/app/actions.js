"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, loginUser, logoutUser, registerUser } from "@/lib/auth";
import { encryptValue } from "@/lib/crypto";
import { getProjectForUser, pingAndRecord } from "@/lib/keeper";
import { getAdminClient } from "@/lib/supabase-admin";
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
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("keeper_projects")
      .insert({
        user_id: user.id,
        name,
        project_url: projectUrl,
        key_ciphertext: encryptValue(publishableKey)
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("Este projeto já está cadastrado na sua conta.");
      }
      throw new Error("Não foi possível cadastrar o projeto.");
    }

    project = data;

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

  const admin = getAdminClient();
  await admin
    .from("keeper_projects")
    .update({
      enabled: !project.enabled,
      updated_at: new Date().toISOString()
    })
    .eq("id", project.id)
    .eq("user_id", user.id);

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

    const changes = {
      name,
      project_url: projectUrl,
      updated_at: new Date().toISOString()
    };

    if (newKeyRaw) {
      changes.key_ciphertext = encryptValue(validatePublishableKey(newKeyRaw));
    }

    const admin = getAdminClient();
    const { error } = await admin
      .from("keeper_projects")
      .update(changes)
      .eq("id", project.id)
      .eq("user_id", user.id);

    if (error) throw new Error("Não foi possível salvar as alterações.");
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

  const admin = getAdminClient();
  await admin
    .from("keeper_projects")
    .delete()
    .eq("id", project.id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard");
  redirect("/dashboard?deleted=1");
}
