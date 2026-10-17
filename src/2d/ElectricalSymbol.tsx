import type { SymbolShape } from "./symbolLibrary";

type ElectricalShape = Extract<SymbolShape, "outlet" | "switch" | "ceilingLight" | "smokeAlarm" | "panel" | "dedicatedCircuit">;

export default function ElectricalSymbol({ shape, w, d }: { shape: ElectricalShape; w: number; d: number }) {
  const ink = "#176b67";
  const fill = "#e8f5f1";
  const r = Math.min(w, d) * 0.43;
  const label = shape === "smokeAlarm" ? "SD" : shape === "panel" ? "DB" : shape === "dedicatedCircuit" ? "D" : "";

  if (shape === "panel") {
    return <g fill={fill} stroke={ink} strokeWidth={Math.max(1.5, Math.min(w, d) * 0.07)}>
      <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={3} />
      <text x={0} y={d * 0.16} textAnchor="middle" fill={ink} stroke="none" fontSize={Math.min(w, d) * 0.48} fontWeight="700">{label}</text>
    </g>;
  }

  return <g stroke={ink} strokeWidth={Math.max(1.5, Math.min(w, d) * 0.07)} strokeLinecap="round" strokeLinejoin="round">
    <circle r={r} fill={fill} />
    {shape === "outlet" && <>
      <line x1={-r * 0.35} y1={-r * 0.25} x2={-r * 0.35} y2={r * 0.12} />
      <line x1={r * 0.35} y1={-r * 0.25} x2={r * 0.35} y2={r * 0.12} />
      <path d={`M ${-r * 0.24} ${r * 0.4} Q 0 ${r * 0.72} ${r * 0.24} ${r * 0.4}`} fill="none" />
    </>}
    {shape === "switch" && <>
      <line x1={0} y1={r * 0.58} x2={0} y2={-r * 0.22} />
      <circle cx={0} cy={-r * 0.28} r={r * 0.09} fill={ink} />
    </>}
    {shape === "ceilingLight" && <>
      <line x1={-r * 0.55} y1={-r * 0.55} x2={r * 0.55} y2={r * 0.55} />
      <line x1={r * 0.55} y1={-r * 0.55} x2={-r * 0.55} y2={r * 0.55} />
      <circle r={r * 0.2} fill={ink} />
    </>}
    {(shape === "smokeAlarm" || shape === "dedicatedCircuit") && <text x={0} y={r * 0.31} textAnchor="middle" fill={ink} stroke="none" fontSize={r * 0.8} fontWeight="700">{label}</text>}
  </g>;
}
