const INK = "var(--color-symbol-ink)";
const body = { fill: "var(--color-symbol-fill)", stroke: INK, strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" } as const;
const detail = { fill: "none", stroke: INK, strokeWidth: 1, vectorEffect: "non-scaling-stroke" } as const;
const fine = { fill: "none", stroke: INK, strokeWidth: 0.8, vectorEffect: "non-scaling-stroke" } as const;

export type FixtureShape =
  | "toilet"
  | "bidet"
  | "urinal"
  | "basin"
  | "doubleBasin"
  | "vanityUnit"
  | "mirror"
  | "bathtub"
  | "shower"
  | "kitchenSink"
  | "oven"
  | "microwave";

export default function FixtureSymbol({ shape, w, d }: { shape: FixtureShape; w: number; d: number }) {
  const left = -w / 2;
  const top = -d / 2;
  const right = w / 2;
  const bottom = d / 2;
  const small = Math.min(w, d);

  switch (shape) {
    case "toilet":
      return (
        <g>
          <rect x={left + w * 0.22} y={top} width={w * 0.56} height={d * 0.22} rx={small * 0.04} {...body} />
          <ellipse cx={0} cy={top + d * 0.62} rx={w * 0.34} ry={d * 0.3} {...body} />
          <ellipse cx={0} cy={top + d * 0.62} rx={w * 0.2} ry={d * 0.18} {...detail} />
          <line x1={left + w * 0.24} y1={top + d * 0.28} x2={right - w * 0.24} y2={top + d * 0.28} {...fine} />
        </g>
      );
    case "bidet":
      return (
        <g>
          <ellipse cx={0} cy={d * 0.05} rx={w * 0.38} ry={d * 0.38} {...body} />
          <ellipse cx={0} cy={d * 0.08} rx={w * 0.23} ry={d * 0.2} {...detail} />
          <circle cx={0} cy={-d * 0.18} r={small * 0.035} fill={INK} />
        </g>
      );
    case "urinal":
      return (
        <g>
          <path d={`M ${left + w * 0.2} ${top} Q ${left} ${top + d * 0.45} ${left + w * 0.2} ${bottom} Q 0 ${bottom + d * 0.05} ${right - w * 0.2} ${bottom} Q ${right} ${top + d * 0.45} ${right - w * 0.2} ${top} Z`} {...body} />
          <ellipse cx={0} cy={top + d * 0.58} rx={w * 0.2} ry={d * 0.2} {...detail} />
          <circle cx={0} cy={top + d * 0.2} r={small * 0.035} fill={INK} />
        </g>
      );
    case "basin":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={small * 0.12} {...body} />
          <ellipse cx={0} cy={d * 0.08} rx={w * 0.3} ry={d * 0.3} {...detail} />
          <circle cx={0} cy={d * 0.16} r={small * 0.035} fill={INK} />
          <path d={`M ${-w * 0.12} ${top + d * 0.12} Q 0 ${top - d * 0.02} ${w * 0.12} ${top + d * 0.12}`} {...fine} />
        </g>
      );
    case "doubleBasin":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={small * 0.08} {...body} />
          {[-0.25, 0.25].map((x, i) => (
            <g key={i}>
              <ellipse cx={x * w} cy={d * 0.08} rx={w * 0.2} ry={d * 0.3} {...detail} />
              <circle cx={x * w} cy={d * 0.16} r={small * 0.03} fill={INK} />
            </g>
          ))}
        </g>
      );
    case "vanityUnit":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={small * 0.06} {...body} />
          <ellipse cx={0} cy={top + d * 0.42} rx={w * 0.3} ry={d * 0.25} {...detail} />
          <line x1={left + w * 0.08} y1={bottom - d * 0.16} x2={right - w * 0.08} y2={bottom - d * 0.16} {...detail} />
          <circle cx={0} cy={top + d * 0.28} r={small * 0.035} fill={INK} />
        </g>
      );
    case "mirror":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={small * 0.05} {...body} />
          <rect x={left + w * 0.12} y={top + d * 0.12} width={w * 0.76} height={d * 0.76} rx={small * 0.03} {...detail} />
          <line x1={left + w * 0.18} y1={top + d * 0.2} x2={right - w * 0.18} y2={bottom - d * 0.2} {...fine} />
        </g>
      );
    case "bathtub":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={small * 0.18} {...body} />
          <rect x={left + w * 0.08} y={top + d * 0.1} width={w * 0.84} height={d * 0.8} rx={small * 0.14} {...detail} />
          <circle cx={right - w * 0.17} cy={bottom - d * 0.17} r={small * 0.035} fill={INK} />
          <path d={`M ${left + w * 0.18} ${top + d * 0.18} Q ${left + w * 0.28} ${top + d * 0.05} ${left + w * 0.38} ${top + d * 0.18}`} {...fine} />
        </g>
      );
    case "shower":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} {...body} />
          <path d={`M ${left} ${bottom} A ${w * 0.8} ${d * 0.8} 0 0 1 ${right} ${top}`} {...detail} />
          <circle cx={0} cy={0} r={small * 0.05} {...body} />
          <line x1={left} y1={bottom} x2={right} y2={bottom} {...fine} />
        </g>
      );
    case "kitchenSink":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} {...body} />
          <rect x={left + w * 0.1} y={top + d * 0.12} width={w * 0.8} height={d * 0.64} rx={small * 0.08} {...detail} />
          <circle cx={0} cy={top + d * 0.52} r={small * 0.035} fill={INK} />
          <path d={`M ${-w * 0.12} ${top + d * 0.16} Q 0 ${top - d * 0.02} ${w * 0.12} ${top + d * 0.16}`} {...fine} />
        </g>
      );
    case "oven":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} {...body} />
          <rect x={left + w * 0.1} y={top + d * 0.3} width={w * 0.8} height={d * 0.52} rx={small * 0.04} {...detail} />
          <line x1={left + w * 0.12} y1={top + d * 0.18} x2={right - w * 0.12} y2={top + d * 0.18} {...fine} />
          <circle cx={left + w * 0.28} cy={top + d * 0.18} r={small * 0.025} fill={INK} />
          <circle cx={right - w * 0.28} cy={top + d * 0.18} r={small * 0.025} fill={INK} />
        </g>
      );
    case "microwave":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={small * 0.04} {...body} />
          <rect x={left + w * 0.08} y={top + d * 0.12} width={w * 0.62} height={d * 0.76} {...detail} />
          <line x1={right - w * 0.22} y1={top + d * 0.12} x2={right - w * 0.22} y2={bottom - d * 0.12} {...fine} />
          <circle cx={right - w * 0.12} cy={top + d * 0.28} r={small * 0.025} fill={INK} />
          <circle cx={right - w * 0.12} cy={top + d * 0.46} r={small * 0.025} fill={INK} />
        </g>
      );
  }
}
