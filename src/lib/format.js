const formatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza",
  dateStyle: "short",
  timeStyle: "short"
});

export function formatDate(value) {
  if (!value) return "Nunca";
  try {
    return formatter.format(new Date(value));
  } catch {
    return "—";
  }
}

export function formatLatency(value) {
  return Number.isFinite(value) ? `${value} ms` : "—";
}

export function projectRefFromUrl(value) {
  try {
    return new URL(value).hostname.split(".")[0] || "—";
  } catch {
    return "—";
  }
}
