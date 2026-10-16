// Pure statistics for a set of exactly three HTTP samples.
// Only healthy responses contribute to latency; each failed sample still
// contributes to the health ratio and remains visible in the history.
export function summarizeProbes(samples) {
  const healthy = samples.filter(probe => probe.status === "online");
  const protectedCount = samples.filter(probe => probe.status === "protected").length;
  const latencies = healthy.map(probe => probe.latencyMs).filter(Number.isFinite).sort((a,b) => a-b);
  const successCount = healthy.length;
  const medianMs = latencies.length
    ? (latencies.length % 2
      ? latencies[Math.floor(latencies.length / 2)]
      : Math.round((latencies[latencies.length / 2 - 1] + latencies[latencies.length / 2]) / 2))
    : null;
  const meanMs = latencies.length
    ? Math.round(latencies.reduce((a,b) => a + b, 0) / latencies.length)
    : null;
  // Dois sucessos em três bastam para ficar online; o contador 2/3 sinaliza instabilidade.
  const status = successCount >= 2
    ? "online"
    : protectedCount >= 2 ? "protected" : "error";
  return {
    status,
    successCount,
    medianMs,
    meanMs,
    minMs: latencies.length ? latencies[0] : null,
    maxMs: latencies.length ? latencies[latencies.length - 1] : null,
    httpStatus: healthy[0]?.httpStatus ?? samples[2]?.httpStatus ?? null,
    error: successCount === 3 ? null : status === "protected"
      ? "Rota protegida em ao menos 2 de 3 amostras."
      : successCount === 2 ? "Atenção: apenas 2 de 3 amostras responderam corretamente."
      : "Apenas " + successCount + " de 3 amostras responderam corretamente."
  };
}

