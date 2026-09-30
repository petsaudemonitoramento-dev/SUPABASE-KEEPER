export default function StatusPill({ status, enabled = true }) {
  if (!enabled) {
    return <span className="status status-paused"><span />Pausado</span>;
  }

  if (status === "online") {
    return <span className="status status-online"><span />Online</span>;
  }

  if (status === "error") {
    return <span className="status status-error"><span />Erro</span>;
  }

  return <span className="status status-never"><span />Aguardando</span>;
}
