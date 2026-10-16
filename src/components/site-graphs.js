import { formatLatency } from "@/lib/format";

const COLORS = ["#4158d0", "#0e9680", "#b16b29", "#8744b6"];
const TIMEZONE = "America/Fortaleza";
const readableDate = value => new Date(value).toLocaleString("pt-BR", {
  timeZone: TIMEZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
});

export function TimelineGraph({ series = [], days = 7 }) {
  const width = 820;
  const height = 264;
  const pad = { top: 20, right: 24, bottom: 40, left: 58 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const end = Date.now();
  const start = end - days * 24 * 60 * 60 * 1000;

  const cleaned = series.map((item, index) => ({
    name: item.name,
    color: COLORS[index % COLORS.length],
    readings: (item.readings || []).map(value => ({
      time: new Date(value.at ?? value.created_at).getTime(),
      ms: Number(value.ms ?? value.median_ms)
    })).filter(x => Number.isFinite(x.ms) && Number.isFinite(x.time)
      && x.ms >= 0 && x.time >= start && x.time <= end).sort((a,b) => a.time - b.time)
  }));
  const all = cleaned.flatMap(item => item.readings);
  if (!all.length) return <p className="muted-text">Aguardando a primeira rodada de três medições. O histórico anterior foi preservado separadamente.</p>;

  const maxLatency = Math.max(100, ...all.map(p => p.ms));
  const ceiling = Math.ceil((maxLatency * 1.15) / 50) * 50;
  const posX = time => pad.left + ((time - start) / (end - start)) * plotW;
  const posY = ms => pad.top + plotH - (ms / ceiling) * plotH;
  const tickDate = time => new Date(time).toLocaleDateString("pt-BR", {
    timeZone: TIMEZONE, day: "2-digit", month: "2-digit"
  });
  const axisColor = "#98a2b3";

  return (
    <div className="visual-report">
      <div className="graph-legend">
        {cleaned.map(item => (
          <span key={item.name}><i style={{ background: item.color }}/>
            {item.name} <small>({item.readings.length} rodadas)</small>
          </span>
        ))}
      </div>
      <svg className="trend-svg" viewBox={`0 0 ${width} ${height}`}
        role="img" aria-label={`Gráfico de latência mediana por rodada nos últimos ${days} dias, em milissegundos.`}>
        {[0, 0.25, 0.5, 0.75, 1].map(factor => {
          const y = posY(ceiling * factor);
          return <g key={factor}>
            <line x1={pad.left} y1={y} x2={width-pad.right} y2={y} stroke="#e7ebf2" />
            <text x={pad.left-12} y={y+4} fill={axisColor} fontSize="12" textAnchor="end">
              {Math.round(ceiling*factor)} ms
            </text>
          </g>;
        })}
        {[0, 0.25, 0.5, 0.75, 1].map(factor => {
          const time = start + (end - start) * factor;
          const x = posX(time);
          return <text key={factor} x={x} y={height-9} fill={axisColor}
            fontSize="12" textAnchor={factor===0?"start":factor===1?"end":"middle"}>{tickDate(time)}</text>;
        })}
        {cleaned.map(item => {
          const points = item.readings.map(p => `${posX(p.time).toFixed(1)},${posY(p.ms).toFixed(1)}`).join(" ");
          return <g key={item.name}>
            {item.readings.length > 1 ? <polyline points={points}
              fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
            {item.readings.map((p,index) =>
              <circle key={index} cx={posX(p.time)} cy={posY(p.ms)} r="4.5"
                fill={item.color} stroke="white" strokeWidth="2">
                <title>{item.name}: {p.ms} ms — {readableDate(p.time)}</title>
              </circle>
            )}
          </g>;
        })}
      </svg>
      <p className="muted-text">Cada ponto é a mediana dos testes bem-sucedidos de uma rodada. Pontos ausentes ou com falha não são considerados latência zero.</p>
    </div>
  );
}

export function ProbeBars({ samples = [] }) {
  if (!samples.length) return <p className="muted-text">Ainda não existem amostras desta rodada.</p>;
  const max = Math.max(1, ...samples.map(p => Number(p.latencyMs) || 0));
  return (
    <div className="probe-grid" role="list" aria-label="Amostras individuais da última rodada">
      {samples.map((sample,index) => (
        <div className="probe-card" role="listitem" key={sample.index || index}>
          <span>Teste {sample.index || index+1}</span>
          <strong>{formatLatency(sample.latencyMs)}</strong>
          <div className="probe-track">
            <div className={"probe-fill " + (sample.status==="online"?"probe-good":"probe-bad")}
              style={{width:Math.max(3, Math.round((Number(sample.latencyMs)||0)/max*100))+"%"}}/>
          </div>
          <small>{sample.status==="online"?"Online":sample.status==="protected"?"Protegido":"Falhou"}
            {sample.httpStatus ? " · HTTP "+sample.httpStatus : ""}
          </small>
        </div>
      ))}
    </div>
  );
}
