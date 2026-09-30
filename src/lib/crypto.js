import crypto from "node:crypto";
import { promisify } from "node:util";
import { requiredEnv } from "@/lib/env";

const scryptAsync = promisify(crypto.scrypt);

function encryptionKey() {
  const key = Buffer.from(requiredEnv("KEEPER_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) {
    throw new Error("KEEPER_ENCRYPTION_KEY deve ter exatamente 32 bytes em base64.");
  }
  return key;
}

export function encryptValue(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

export function decryptValue(payload) {
  const [version, ivB64, tagB64, dataB64] = String(payload).split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Credencial criptografada em formato inválido.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

export async function hashPassword(password, salt = crypto.randomBytes(16).toString("base64url")) {
  const derived = await scryptAsync(password, salt, 64);
  return {
    salt,
    hash: Buffer.from(derived).toString("base64url")
  };
}

export async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  const actual = Buffer.from(hash, "base64url");
  const expected = Buffer.from(expectedHash, "base64url");

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
