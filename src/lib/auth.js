import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/supabase-admin";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/crypto";
import { requiredEnv } from "@/lib/env";

const SESSION_COOKIE = "keeper_session";
const SESSION_DAYS = 30;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function setSession(userId) {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const admin = getAdminClient();
  const { error } = await admin.from("keeper_sessions").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString()
  });

  if (error) throw new Error("Não foi possível criar a sessão.");

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

export async function registerUser({ email, password, signupCode }) {
  const expectedCode = requiredEnv("KEEPER_SIGNUP_CODE");
  if (!signupCode || signupCode !== expectedCode) {
    throw new Error("Código de cadastro inválido.");
  }

  const normalized = normalizeEmail(email);
  if (!validateEmail(normalized)) throw new Error("Informe um e-mail válido.");
  if (String(password || "").length < 12) {
    throw new Error("A senha precisa ter pelo menos 12 caracteres.");
  }

  const admin = getAdminClient();
  const { data: existing } = await admin
    .from("keeper_users")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();

  if (existing) throw new Error("Já existe uma conta com este e-mail.");

  const { salt, hash } = await hashPassword(password);
  const { data, error } = await admin
    .from("keeper_users")
    .insert({
      email: normalized,
      password_hash: hash,
      password_salt: salt
    })
    .select("id,email")
    .single();

  if (error) throw new Error("Não foi possível criar a conta.");

  await setSession(data.id);
  return data;
}

export async function loginUser({ email, password }) {
  const normalized = normalizeEmail(email);
  const admin = getAdminClient();

  const { data: user } = await admin
    .from("keeper_users")
    .select("id,email,password_hash,password_salt")
    .eq("email", normalized)
    .maybeSingle();

  if (!user) throw new Error("E-mail ou senha inválidos.");

  const valid = await verifyPassword(password || "", user.password_salt, user.password_hash);
  if (!valid) throw new Error("E-mail ou senha inválidos.");

  await admin
    .from("keeper_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  await setSession(user.id);
  return { id: user.id, email: user.email };
}

export async function logoutUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    const admin = getAdminClient();
    await admin.from("keeper_sessions").delete().eq("token_hash", sha256(token));
  }

  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const admin = getAdminClient();
  const now = new Date().toISOString();

  const { data: session } = await admin
    .from("keeper_sessions")
    .select("id,user_id,expires_at")
    .eq("token_hash", sha256(token))
    .gt("expires_at", now)
    .maybeSingle();

  if (!session) {
    return null;
  }

  const { data: user } = await admin
    .from("keeper_users")
    .select("id,email,created_at,last_login_at")
    .eq("id", session.user_id)
    .maybeSingle();

  return user || null;
}
