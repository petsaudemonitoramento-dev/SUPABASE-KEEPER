export function normalizeProjectUrl(input) {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    throw new Error("URL do Supabase inválida.");
  }

  if (url.protocol !== "https:") {
    throw new Error("A URL precisa usar HTTPS.");
  }

  if (url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("Informe somente a URL base do projeto Supabase.");
  }

  const hostname = url.hostname.toLowerCase();
  if (!/^[a-z0-9-]+\.supabase\.co$/.test(hostname)) {
    throw new Error("Use a URL oficial do projeto no formato https://xxxx.supabase.co.");
  }

  return `https://${hostname}`;
}

export function validatePublishableKey(input) {
  const key = String(input || "").trim();

  const modern = /^sb_publishable_[A-Za-z0-9_-]{20,}$/;
  const legacyAnon = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

  if (!modern.test(key) && !legacyAnon.test(key)) {
    throw new Error("Informe uma Publishable Key válida (ou a chave anon legada).");
  }

  return key;
}

export function validateProjectName(input) {
  const name = String(input || "").trim();
  if (!name || name.length > 80) {
    throw new Error("O nome deve ter entre 1 e 80 caracteres.");
  }
  return name;
}
