import { cookies } from "next/headers";
import { db } from "@/lib/db";
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
  const sql = db();

  await sql`
    insert into keeper_sessions (user_id, token_hash, expires_at)
    values (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

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

  const sql = db();
  const existing = await sql`
    select id
    from keeper_users
    where email = ${normalized}
    limit 1
  `;

  if (existing.length) throw new Error("Já existe uma conta com este e-mail.");

  const { salt, hash } = await hashPassword(password);

  let rows;
  try {
    rows = await sql`
      insert into keeper_users (email, password_hash, password_salt)
      values (${normalized}, ${hash}, ${salt})
      returning id, email
    `;
  } catch (error) {
    if (error?.code === "23505") {
      throw new Error("Já existe uma conta com este e-mail.");
    }
    throw new Error("Não foi possível criar a conta.");
  }

  const user = rows[0];
  await setSession(user.id);
  return user;
}

export async function loginUser({ email, password }) {
  const normalized = normalizeEmail(email);
  const sql = db();

  const rows = await sql`
    select id, email, password_hash, password_salt
    from keeper_users
    where email = ${normalized}
    limit 1
  `;

  const user = rows[0];
  if (!user) throw new Error("E-mail ou senha inválidos.");

  const valid = await verifyPassword(password || "", user.password_salt, user.password_hash);
  if (!valid) throw new Error("E-mail ou senha inválidos.");

  await sql`
    update keeper_users
    set last_login_at = now()
    where id = ${user.id}
  `;

  await setSession(user.id);
  return { id: user.id, email: user.email };
}

export async function logoutUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    const sql = db();
    await sql`
      delete from keeper_sessions
      where token_hash = ${sha256(token)}
    `;
  }

  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const sql = db();
  const tokenHash = sha256(token);

  const rows = await sql`
    select
      u.id,
      u.email,
      u.created_at,
      u.last_login_at
    from keeper_sessions s
    join keeper_users u on u.id = s.user_id
    where s.token_hash = ${tokenHash}
      and s.expires_at > now()
    limit 1
  `;

  const user = rows[0] || null;

  if (user) {
    await sql`
      update keeper_sessions
      set last_seen_at = now()
      where token_hash = ${tokenHash}
    `;
  }

  return user;
}
