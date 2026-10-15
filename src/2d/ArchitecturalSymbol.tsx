const INK = "var(--color-symbol-ink)";
const body = { fill: "var(--color-symbol-fill)", stroke: INK, strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" } as const;
const detail = { fill: "none", stroke: INK, strokeWidth: 1, vectorEffect: "non-scaling-stroke" } as const;
const fine = { fill: "none", stroke: INK, strokeWidth: 0.8, vectorEffect: "non-scaling-stroke" } as const;

export type ArchitecturalShape =
  | "door"
  | "doubleDoor"
  | "slidingDoor"
  | "window"
  | "stairs"
  | "column"
  | "fireplace";

export default function ArchitecturalSymbol({ shape, w, d }: { shape: ArchitecturalShape; w: number; d: number }) {
  const left = -w / 2;
  const top = -d / 2;
  const right = w / 2;
  const bottom = d / 2;
  const small = Math.min(w, d);

  switch (shape) {
    case "door": {
      const hingeX = left;
      const radius = Math.min(w, d * 1.8);
      return (
        <g>
          <line x1={left} y1={top} x2={left} y2={bottom} {...body} />
          <path d={`M ${hingeX} ${top} A ${radius} ${radius} 0 0 1 ${hingeX + radius} ${bottom}`} {...detail} />
          <line x1={hingeX} y1={top} x2={hingeX + radius} y2={bottom} {...body} />
        </g>
      );
    }
    case "doubleDoor": {
      const mid = 0;
      const radius = Math.min(w / 2, d * 1.8);
      return (
        <g>
          <line x1={left} y1={top} x2={left} y2={bottom} {...body} />
          <line x1={right} y1={top} x2={right} y2={bottom} {...body} />
          <path d={`M ${mid} ${top} A ${radius} ${radius} 0 0 1 ${left} ${bottom}`} {...detail} />
          <path d={`M ${mid} ${top} A ${radius} ${radius} 0 0 0 ${right} ${bottom}`} {...detail} />
          <line x1={mid} y1={top} x2={left} y2={bottom} {...body} />
          <line x1={mid} y1={top} x2={right} y2={bottom} {...body} />
        </g>
      );
    }
    case "slidingDoor":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} {...body} />
          <line x1={left + w * 0.08} y1={top + d * 0.28} x2={right - w * 0.08} y2={top + d * 0.28} {...detail} />
          <line x1={right - w * 0.08} y1={bottom - d * 0.28} x2={left + w * 0.08} y2={bottom - d * 0.28} {...detail} />
          <path d={`M ${left + w * 0.2} ${top + d * 0.28} H ${right - w * 0.2} M ${right - w * 0.2} ${top + d * 0.28} l-${w * 0.07} -${d * 0.06} M ${right - w * 0.2} ${top + d * 0.28} l-${w * 0.07} ${d * 0.06}`} {...fine} />
        </g>
      );
    case "window":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} {...body} />
          <rect x={left + w * 0.12} y={top + d * 0.16} width={w * 0.76} height={d * 0.68} {...detail} />
          <line x1={0} y1={top + d * 0.16} x2={0} y2={bottom - d * 0.16} {...fine} />
          <line x1={left + w * 0.12} y1={0} x2={right - w * 0.12} y2={0} {...fine} />
        </g>
      );
    case "stairs": {
      const steps = Math.max(5, Math.min(12, Math.round(d / Math.max(w * 0.16, 0.35))));
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} {...body} />
          {Array.from({ length: steps - 1 }, (_, i) => {
            const y = top + ((i + 1) * d) / steps;
            return <line key={i} x1={left} y1={y} x2={right} y2={y} {...detail} />;
          })}
          <path d={`M ${left + w * 0.18} ${bottom - d * 0.15} V ${top + d * 0.15} H ${right - w * 0.18} M ${right - w * 0.18} ${top + d * 0.15} l-${w * 0.08} -${d * 0.06} M ${right - w * 0.18} ${top + d * 0.15} l-${w * 0.08} ${d * 0.06}`} {...fine} />
        </g>
      );
    }
    case "column": {
      const r = small * 0.42;
      return (
        <g>
          <circle cx={0} cy={0} r={r} {...body} />
          <circle cx={0} cy={0} r={r * 0.7} {...detail} />
          <path d={`M ${-r * 0.45} ${-r * 0.45} L ${r * 0.45} ${r * 0.45} M ${r * 0.45} ${-r * 0.45} L ${-r * 0.45} ${r * 0.45}`} {...fine} />
        </g>
      );
    }
    case "fireplace":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={small * 0.04} {...body} />
          <path d={`M ${left + w * 0.18} ${bottom} V ${top + d * 0.4} Q 0 ${top + d * 0.12} ${right - w * 0.18} ${top + d * 0.4} V ${bottom}`} {...detail} />
          <path d={`M ${left + w * 0.3} ${bottom - d * 0.08} Q 0 ${bottom - d * 0.35} ${right - w * 0.3} ${bottom - d * 0.08}`} {...fine} />
        </g>
      );
  }
}