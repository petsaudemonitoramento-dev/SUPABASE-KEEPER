import { normalizeProjectUrl } from "@/lib/validators";

const DEFAULT_PATH = "/rest/v1/rpc/keeper_ping";
const TIMEOUT_MS = 8000;

function cleanErrorBody(text) {
  return String(text || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export async function pingSupabase({ projectUrl, publishableKey, pingPath = DEFAULT_PATH }) {
  const baseUrl = normalizeProjectUrl(projectUrl);
  const safePath = String(pingPath || DEFAULT_PATH);

  if (!safePath.startsWith("/rest/v1/rpc/")) {
    throw new Error("Caminho de ping inválido.");
  }

  const endpoint = new URL(safePath, baseUrl);
  const started = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "content-type": "application/json",
        "user-agent": "supabase-keeper/1.0"
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    const latencyMs = Math.max(0, Math.round(performance.now() - started));

    if (!response.ok) {
      const body = cleanErrorBody(await response.text());
      const setupHint =
        response.status === 404
          ? " Função keeper_ping não encontrada; execute o SQL de instalação no projeto."
          : "";

      return {
        ok: false,
        latencyMs,
        httpStatus: response.status,
        error: `HTTP ${response.status}${body ? `: ${body}` : ""}.${setupHint}`
      };
    }

    return {
      ok: true,
      latencyMs,
      httpStatus: response.status,
      error: null
    };
  } catch (error) {
    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    const timedOut =
      error?.name === "TimeoutError" ||
      error?.name === "AbortError";

    return {
      ok: false,
      latencyMs,
      httpStatus: null,
      error: timedOut
        ? "Tempo limite de 8 segundos excedido."
        : "Não foi possível alcançar o projeto Supabase."
    };
  }
}
