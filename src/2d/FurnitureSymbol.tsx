import type { SymbolShape } from "./symbolLibrary";

const INK = "var(--color-symbol-ink)";

// Main silhouette: slightly heavier than the internal construction details.
const body = {
  fill: "var(--color-symbol-fill)",
  stroke: INK,
  strokeWidth: 1.5,
  vectorEffect: "non-scaling-stroke",
} as const;

const detail = {
  fill: "none",
  stroke: INK,
  strokeWidth: 1,
  vectorEffect: "non-scaling-stroke",
} as const;

const fine = {
  fill: "none",
  stroke: INK,
  strokeWidth: 0.8,
  vectorEffect: "non-scaling-stroke",
} as const;

const accent = {
  fill: "none",
  stroke: INK,
  strokeWidth: 1.2,
  vectorEffect: "non-scaling-stroke",
} as const;

/**
 * Detailed top-down architectural furniture symbols.
 *
 * The symbol is centred on 0,0. x is width and y is depth.
 * The front / usable side faces +y (south on the plan).
 *
 * The goal is not photorealism. Each symbol uses a recognizable silhouette
 * plus a few construction details (cushions, seams, handles, legs, fixtures,
 * etc.) so it reads like a presentation-quality furniture plan.
 */
export default function FurnitureSymbol({
  shape,
  w,
  d,
}: {
  shape: SymbolShape;
  w: number;
  d: number;
}) {
  const left = -w / 2;
  const top = -d / 2;
  const right = w / 2;
  const bottom = d / 2;
  const small = Math.min(w, d);
  const r = small * 0.08;

  switch (shape) {
    case "sofa": {
      const back = d * 0.22;
      const arm = Math.min(w * 0.13, d * 0.27);
      const seatTop = top + back + d * 0.035;
      const seatBottom = bottom - d * 0.12;
      const seatWidth = w - arm * 2;
      const seats = Math.max(2, Math.min(4, Math.round(seatWidth / (d * 0.75))));
      const gap = Math.max(small * 0.025, w * 0.018);
      const cushionWidth = (seatWidth - gap * (seats - 1)) / seats;

      return (
        <g>
          {/* Overall upholstered shell */}
          <rect x={left} y={top} width={w} height={d} rx={r * 1.8} {...body} />

          {/* Back cushion silhouette */}
          <path
            d={`M ${left + arm} ${top + back * 0.92}
                Q 0 ${top + back * 0.48} ${right - arm} ${top + back * 0.92}`}
            {...detail}
          />

          {/* Arms */}
          <path
            d={`M ${left} ${top + back}
                Q ${left} ${top + d * 0.5} ${left + arm} ${top + d * 0.52}
                L ${left + arm} ${bottom - d * 0.08}
                Q ${left + arm * 0.55} ${bottom} ${left} ${bottom}
                Z`}
            {...body}
          />
          <path
            d={`M ${right} ${top + back}
                Q ${right} ${top + d * 0.5} ${right - arm} ${top + d * 0.52}
                L ${right - arm} ${bottom - d * 0.08}
                Q ${right - arm * 0.55} ${bottom} ${right} ${bottom}
                Z`}
            {...body}
          />

          {/* Individual seat cushions */}
          {Array.from({ length: seats }, (_, i) => {
            const x = left + arm + i * (cushionWidth + gap);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={seatTop}
                  width={cushionWidth}
                  height={seatBottom - seatTop}
                  rx={d * 0.055}
                  {...body}
                />
                <line
                  x1={x + cushionWidth * 0.08}
                  y1={seatBottom - d * 0.035}
                  x2={x + cushionWidth * 0.92}
                  y2={seatBottom - d * 0.035}
                  {...fine}
                />
              </g>
            );
          })}

          {/* Back cushion seams */}
          {Array.from({ length: seats - 1 }, (_, i) => {
            const x = left + arm + (i + 1) * cushionWidth + i * gap + gap / 2;
            return <line key={i} x1={x} y1={top + d * 0.04} x2={x} y2={top + back * 0.86} {...fine} />;
          })}

          {/* Small feet */}
          <line x1={left + w * 0.13} y1={bottom - d * 0.02} x2={left + w * 0.105} y2={bottom + d * 0.075} {...detail} />
          <line x1={right - w * 0.13} y1={bottom - d * 0.02} x2={right - w * 0.105} y2={bottom + d * 0.075} {...detail} />
        </g>
      );
    }

    case "sectional": {
      const arm = small * 0.13;
      const seat = small * 0.48;
      const back = seat * 0.32;
      const longSeat = Math.max(w - seat, small * 0.6);

      return (
        <g>
          {/* L-shaped upholstered body */}
          <path
            d={`M ${left + arm} ${top}
                H ${right - arm}
                Q ${right} ${top} ${right} ${top + arm}
                V ${top + seat}
                H ${left + seat}
                V ${bottom - arm}
                Q ${left + seat} ${bottom} ${left + seat - arm} ${bottom}
                H ${left}
                V ${top + arm}
                Q ${left} ${top} ${left + arm} ${top}
                Z`}
            {...body}
          />

          {/* Long back */}
          <path
            d={`M ${left + arm} ${top + back}
                Q 0 ${top + back * 0.45} ${right - arm} ${top + back}`}
            {...detail}
          />

          {/* Corner / return back */}
          <line x1={left + back} y1={top + seat} x2={left + back} y2={bottom - arm} {...detail} />

          {/* Seat divisions */}
          {Array.from({ length: Math.max(1, Math.round(longSeat / (small * 0.72))) - 1 }, (_, i) => {
            const count = Math.max(1, Math.round(longSeat / (small * 0.72)));
            const x = left + seat + ((i + 1) * (w - seat)) / count;
            return <line key={i} x1={x} y1={top + back} x2={x} y2={top + seat - small * 0.02} {...fine} />;
          })}

          {/* Return cushions */}
          <line x1={left + back} y1={top + seat + small * 0.03} x2={left + seat - small * 0.03} y2={top + seat + small * 0.03} {...fine} />
          <line x1={left + seat * 0.52} y1={top + seat} x2={left + seat * 0.52} y2={bottom - arm * 0.7} {...fine} />
        </g>
      );
    }

    case "bed": {
      const head = d * 0.09;
      const pillows = w / d > 0.58 ? 2 : 1;
      const gap = Math.max(w * 0.045, small * 0.03);
      const pillowWidth = (w - gap * (pillows + 1)) / pillows;
      const pillowHeight = d * 0.14;
      const blanketY = top + d * 0.38;

      return (
        <g>
          {/* Bed frame / mattress */}
          <rect x={left} y={top} width={w} height={d} rx={r * 0.9} {...body} />

          {/* Headboard */}
          <rect x={left} y={top} width={w} height={head} rx={r * 0.45} {...body} />
          <line x1={left + w * 0.06} y1={top + head * 0.5} x2={right - w * 0.06} y2={top + head * 0.5} {...fine} />

          {/* Pillows */}
          {Array.from({ length: pillows }, (_, i) => (
            <g key={i}>
              <rect
                x={left + gap + i * (pillowWidth + gap)}
                y={top + head + d * 0.035}
                width={pillowWidth}
                height={pillowHeight}
                rx={d * 0.045}
                {...body}
              />
              <path
                d={`M ${left + gap + i * (pillowWidth + gap) + pillowWidth * 0.18} ${top + head + pillowHeight * 0.78}
                    Q ${left + gap + i * (pillowWidth + gap) + pillowWidth * 0.5} ${top + head + pillowHeight * 0.56}
                      ${left + gap + i * (pillowWidth + gap) + pillowWidth * 0.82} ${top + head + pillowHeight * 0.78}`}
                {...fine}
              />
            </g>
          ))}

          {/* Folded blanket */}
          <path
            d={`M ${left} ${blanketY}
                Q ${left + w * 0.5} ${blanketY + d * 0.055} ${right} ${blanketY}
                L ${right} ${bottom - d * 0.04}
                H ${left}
                Z`}
            {...body}
          />
          <path
            d={`M ${left} ${blanketY + d * 0.075}
                Q ${left + w * 0.5} ${blanketY + d * 0.12} ${right} ${blanketY + d * 0.075}`}
            {...detail}
          />

          {/* Frame feet */}
          <line x1={left + w * 0.08} y1={bottom} x2={left + w * 0.06} y2={bottom + d * 0.055} {...fine} />
          <line x1={right - w * 0.08} y1={bottom} x2={right - w * 0.06} y2={bottom + d * 0.055} {...fine} />
        </g>
      );
    }

    case "table": {
      const inset = small * 0.1;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.9} {...body} />
          <rect x={left + inset} y={top + inset} width={w - inset * 2} height={d - inset * 2} rx={r * 0.55} {...detail} />
          {/* Four leg markers */}
          {[
            [left + w * 0.16, top + d * 0.16],
            [right - w * 0.16, top + d * 0.16],
            [left + w * 0.16, bottom - d * 0.16],
            [right - w * 0.16, bottom - d * 0.16],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={small * 0.025} fill={INK} />
          ))}
        </g>
      );
    }

    case "roundTable": {
      return (
        <g>
          <ellipse cx={0} cy={0} rx={w / 2} ry={d / 2} {...body} />
          <ellipse cx={0} cy={0} rx={w * 0.38} ry={d * 0.38} {...detail} />
          <circle cx={0} cy={0} r={small * 0.045} fill={INK} />
          {[0, 90, 180, 270].map((deg) => {
            const a = (deg * Math.PI) / 180;
            const x = Math.cos(a) * w * 0.38;
            const y = Math.sin(a) * d * 0.38;
            return <circle key={deg} cx={x} cy={y} r={small * 0.022} fill={INK} />;
          })}
        </g>
      );
    }

    case "diningSet": {
      const chair = Math.min(d * 0.24, w * 0.22);
      const count = Math.max(2, Math.min(4, Math.floor(w / (chair * 1.65))));
      const spacing = w / count;
      const centres = Array.from({ length: count }, (_, i) => left + spacing * (i + 0.5));
      const tableTop = top + chair * 0.72;
      const tableBottom = bottom - chair * 0.72;

      return (
        <g>
          {/* Chairs first so the table reads on top */}
          {centres.map((cx, i) => (
            <g key={`top-${i}`}>
              <rect x={cx - chair / 2} y={top} width={chair} height={chair * 0.72} rx={chair * 0.18} {...body} />
              <line x1={cx - chair * 0.27} y1={top + chair * 0.72} x2={cx + chair * 0.27} y2={top + chair * 0.72} {...fine} />
            </g>
          ))}
          {centres.map((cx, i) => (
            <g key={`bottom-${i}`}>
              <rect x={cx - chair / 2} y={bottom - chair * 0.72} width={chair} height={chair * 0.72} rx={chair * 0.18} {...body} />
              <line x1={cx - chair * 0.27} y1={bottom - chair * 0.72} x2={cx + chair * 0.27} y2={bottom - chair * 0.72} {...fine} />
            </g>
          ))}

          <rect x={left + w * 0.05} y={tableTop} width={w * 0.9} height={tableBottom - tableTop} rx={r} {...body} />
          <rect x={left + w * 0.09} y={tableTop + d * 0.045} width={w * 0.82} height={tableBottom - tableTop - d * 0.09} rx={r * 0.55} {...detail} />
        </g>
      );
    }

    case "chair": {
      const back = d * 0.24;
      const arm = Math.min(w * 0.12, d * 0.12);
      const seatY = top + back * 0.82;

      return (
        <g>
          {/* Curved chair silhouette */}
          <path
            d={`M ${left + w * 0.16} ${bottom}
                Q ${left} ${d * 0.38} ${left + w * 0.12} ${top + back}
                Q ${left + w * 0.5} ${top} ${right - w * 0.12} ${top + back}
                Q ${right} ${d * 0.38} ${right - w * 0.16} ${bottom}
                Z`}
            {...body}
          />

          {/* Back cushion */}
          <path
            d={`M ${left + w * 0.2} ${seatY}
                Q ${0} ${top + back * 0.25} ${right - w * 0.2} ${seatY}`}
            {...detail}
          />

          {/* Seat cushion */}
          <rect x={left + arm} y={seatY} width={w - arm * 2} height={d * 0.3} rx={d * 0.08} {...body} />
          <path d={`M ${left + arm * 1.5} ${seatY + d * 0.22} Q 0 ${seatY + d * 0.15} ${right - arm * 1.5} ${seatY + d * 0.22}`} {...fine} />

          {/* Front legs */}
          <line x1={left + w * 0.19} y1={bottom - d * 0.02} x2={left + w * 0.15} y2={bottom + d * 0.07} {...detail} />
          <line x1={right - w * 0.19} y1={bottom - d * 0.02} x2={right - w * 0.15} y2={bottom + d * 0.07} {...detail} />
        </g>
      );
    }

    case "officeChair": {
      const base = small * 0.31;
      return (
        <g>
          {/* Five-star base */}
          <circle cx={0} cy={d * 0.12} r={base * 0.22} {...detail} />
          {[0, 72, 144, 216, 288].map((deg) => {
            const a = (deg * Math.PI) / 180;
            return (
              <line
                key={deg}
                x1={0}
                y1={d * 0.12}
                x2={Math.cos(a) * base}
                y2={d * 0.12 + Math.sin(a) * base}
                {...detail}
              />
            );
          })}

          {/* Seat */}
          <ellipse cx={0} cy={d * 0.02} rx={w * 0.38} ry={d * 0.26} {...body} />

          {/* Back */}
          <path
            d={`M ${left + w * 0.17} ${top + d * 0.24}
                Q 0 ${top - d * 0.01} ${right - w * 0.17} ${top + d * 0.24}
                L ${right - w * 0.12} ${top + d * 0.48}
                Q 0 ${top + d * 0.57} ${left + w * 0.12} ${top + d * 0.48}
                Z`}
            {...body}
          />
          <line x1={left + w * 0.22} y1={top + d * 0.31} x2={right - w * 0.22} y2={top + d * 0.31} {...fine} />
        </g>
      );
    }

    case "cabinet": {
      const handle = small * 0.035;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.45} {...body} />
          <line x1={0} y1={top + d * 0.04} x2={0} y2={bottom - d * 0.12} {...detail} />
          <line x1={left + w * 0.05} y1={bottom - d * 0.13} x2={right - w * 0.05} y2={bottom - d * 0.13} {...detail} />
          <circle cx={-w * 0.08} cy={top + d * 0.47} r={handle} fill={INK} />
          <circle cx={w * 0.08} cy={top + d * 0.47} r={handle} fill={INK} />
          <line x1={left + w * 0.1} y1={bottom} x2={left + w * 0.08} y2={bottom + d * 0.055} {...fine} />
          <line x1={right - w * 0.1} y1={bottom} x2={right - w * 0.08} y2={bottom + d * 0.055} {...fine} />
        </g>
      );
    }

    case "wardrobe": {
      const handle = small * 0.035;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.3} {...body} />
          <line x1={0} y1={top} x2={0} y2={bottom} {...detail} />
          <line x1={left + w * 0.07} y1={top + d * 0.23} x2={right - w * 0.07} y2={top + d * 0.23} {...fine} strokeDasharray="4 3" />
          <line x1={left + w * 0.07} y1={top + d * 0.3} x2={right - w * 0.07} y2={top + d * 0.3} {...fine} strokeDasharray="4 3" />
          <circle cx={-w * 0.055} cy={top + d * 0.52} r={handle} fill={INK} />
          <circle cx={w * 0.055} cy={top + d * 0.52} r={handle} fill={INK} />
          <line x1={left + w * 0.05} y1={bottom - d * 0.08} x2={right - w * 0.05} y2={bottom - d * 0.08} {...fine} />
        </g>
      );
    }

    case "shelf": {
      const bays = Math.max(2, Math.min(6, Math.round(w / (d * 1.15))));
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.35} {...body} />
          {Array.from({ length: bays - 1 }, (_, i) => {
            const x = left + ((i + 1) * w) / bays;
            return <line key={i} x1={x} y1={top} x2={x} y2={bottom} {...detail} />;
          })}
          <line x1={left + w * 0.04} y1={top + d * 0.22} x2={right - w * 0.04} y2={top + d * 0.22} {...fine} />
          <line x1={left + w * 0.04} y1={bottom - d * 0.18} x2={right - w * 0.04} y2={bottom - d * 0.18} {...fine} />
          {Array.from({ length: Math.max(2, bays) }, (_, i) => (
            <path
              key={`book-${i}`}
              d={`M ${left + (i + 0.15) * (w / bays)} ${top + d * 0.25}
                  V ${bottom - d * 0.22}`}
              {...fine}
            />
          ))}
        </g>
      );
    }

    case "tvUnit":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.4} {...body} />
          <rect x={left + w * 0.06} y={top + d * 0.16} width={w * 0.88} height={d * 0.46} rx={r * 0.35} {...detail} />
          <line x1={left + w * 0.14} y1={bottom - d * 0.18} x2={right - w * 0.14} y2={bottom - d * 0.18} {...fine} />
          <circle cx={left + w * 0.12} cy={bottom - d * 0.08} r={small * 0.025} fill={INK} />
          <circle cx={right - w * 0.12} cy={bottom - d * 0.08} r={small * 0.025} fill={INK} />
        </g>
      );

    case "rug":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.5} fill="var(--color-rug)" stroke={INK} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <rect x={left + small * 0.075} y={top + small * 0.075} width={w - small * 0.15} height={d - small * 0.15} rx={r * 0.35} {...detail} />
          <rect x={left + small * 0.14} y={top + small * 0.14} width={w - small * 0.28} height={d - small * 0.28} rx={r * 0.25} {...fine} />
          <path d={`M ${left + w * 0.08} ${top + d * 0.5} H ${right - w * 0.08}`} {...fine} strokeDasharray="2 3" />
          <path d={`M ${left + w * 0.5} ${top + d * 0.08} V ${bottom - d * 0.08}`} {...fine} strokeDasharray="2 3" />
        </g>
      );

    case "fridge":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.35} {...body} />
          <line x1={left} y1={top + d * 0.47} x2={right} y2={top + d * 0.47} {...detail} />
          <line x1={left + w * 0.1} y1={top + d * 0.08} x2={left + w * 0.1} y2={top + d * 0.39} {...fine} />
          <line x1={left + w * 0.1} y1={top + d * 0.58} x2={left + w * 0.1} y2={bottom - d * 0.08} {...fine} />
          <circle cx={left + w * 0.12} cy={top + d * 0.18} r={small * 0.025} fill={INK} />
          <circle cx={left + w * 0.12} cy={top + d * 0.73} r={small * 0.025} fill={INK} />
        </g>
      );

    case "stove":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.3} {...body} />
          {[
            [-0.22, -0.22],
            [0.22, -0.22],
            [-0.22, 0.22],
            [0.22, 0.22],
          ].map(([sx, sy], i) => (
            <g key={i}>
              <circle cx={sx * w} cy={sy * d} r={small * 0.13} {...detail} />
              <circle cx={sx * w} cy={sy * d} r={small * 0.035} fill={INK} />
            </g>
          ))}
          <line x1={left + w * 0.12} y1={bottom - d * 0.08} x2={right - w * 0.12} y2={bottom - d * 0.08} {...fine} />
        </g>
      );

    case "sink":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.35} {...body} />
          <rect x={left + w * 0.11} y={top + d * 0.23} width={w * 0.78} height={d * 0.6} rx={small * 0.11} {...detail} />
          <ellipse cx={0} cy={top + d * 0.52} rx={w * 0.28} ry={d * 0.18} {...fine} />
          <circle cx={0} cy={top + d * 0.13} r={small * 0.035} fill={INK} />
          <path d={`M 0 ${top + d * 0.13} Q ${w * 0.08} ${top + d * 0.05} ${w * 0.12} ${top + d * 0.13}`} {...fine} />
        </g>
      );

    case "counter":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.25} {...body} />
          <line x1={left} y1={top + d * 0.1} x2={right} y2={top + d * 0.1} {...detail} />
          <line x1={left + w * 0.04} y1={top + d * 0.74} x2={right - w * 0.04} y2={top + d * 0.74} {...fine} />
          {Array.from({ length: Math.max(1, Math.round(w / (small * 0.75))) - 1 }, (_, i) => {
            const n = Math.max(1, Math.round(w / (small * 0.75)));
            const x = left + (w * (i + 1)) / n;
            return <line key={i} x1={x} y1={top + d * 0.74} x2={x} y2={bottom} {...fine} />;
          })}
        </g>
      );

    case "dishwasher":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.25} {...body} />
          <rect x={left + w * 0.1} y={top + d * 0.1} width={w * 0.8} height={d * 0.8} rx={r * 0.2} {...detail} />
          <line x1={left + w * 0.17} y1={top + d * 0.25} x2={right - w * 0.17} y2={top + d * 0.25} {...fine} />
          <circle cx={left + w * 0.28} cy={top + d * 0.17} r={small * 0.022} fill={INK} />
          <circle cx={left + w * 0.37} cy={top + d * 0.17} r={small * 0.022} fill={INK} />
        </g>
      );

    case "washer":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.3} {...body} />
          <line x1={left + w * 0.12} y1={top + d * 0.16} x2={right - w * 0.12} y2={top + d * 0.16} {...fine} />
          <circle cx={0} cy={top + d * 0.56} r={small * 0.28} {...detail} />
          <circle cx={0} cy={top + d * 0.56} r={small * 0.08} {...fine} />
          <circle cx={left + w * 0.18} cy={top + d * 0.16} r={small * 0.025} fill={INK} />
        </g>
      );

    case "toilet": {
      const tank = d * 0.25;
      return (
        <g>
          {/* Tank */}
          <rect x={left + w * 0.1} y={top} width={w * 0.8} height={tank} rx={r * 0.35} {...body} />
          <line x1={left + w * 0.18} y1={top + tank * 0.48} x2={right - w * 0.18} y2={top + tank * 0.48} {...fine} />
          {/* Bowl */}
          <path
            d={`M ${left + w * 0.16} ${top + tank}
                Q ${left} ${top + d * 0.55} ${left + w * 0.18} ${bottom - d * 0.1}
                Q 0 ${bottom + d * 0.04} ${right - w * 0.18} ${bottom - d * 0.1}
                Q ${right} ${top + d * 0.55} ${right - w * 0.16} ${top + tank}
                Z`}
            {...body}
          />
          <ellipse cx={0} cy={top + d * 0.63} rx={w * 0.25} ry={d * 0.17} {...detail} />
          <ellipse cx={0} cy={top + d * 0.63} rx={w * 0.14} ry={d * 0.08} {...fine} />
        </g>
      );
    }

    case "basin":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.65} {...body} />
          <ellipse cx={0} cy={d * 0.08} rx={w * 0.36} ry={d * 0.29} {...detail} />
          <ellipse cx={0} cy={d * 0.08} rx={w * 0.2} ry={d * 0.13} {...fine} />
          <circle cx={0} cy={top + d * 0.13} r={small * 0.035} fill={INK} />
          <path d={`M 0 ${top + d * 0.13} Q ${w * 0.1} ${top + d * 0.06} ${w * 0.13} ${top + d * 0.14}`} {...fine} />
        </g>
      );

    case "bathtub":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={small * 0.14} {...body} />
          <rect x={left + small * 0.09} y={top + small * 0.09} width={w - small * 0.18} height={d - small * 0.18} rx={small * 0.24} {...detail} />
          <path d={`M ${left + w * 0.12} ${top + d * 0.25} Q 0 ${top + d * 0.15} ${right - w * 0.12} ${top + d * 0.25}`} {...fine} />
          <circle cx={left + w * 0.14} cy={top + d * 0.16} r={small * 0.04} {...detail} />
          <circle cx={right - w * 0.13} cy={bottom - d * 0.15} r={small * 0.035} fill={INK} />
        </g>
      );

    case "shower":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.25} {...body} />
          {/* Glass enclosure */}
          <line x1={left} y1={top} x2={right} y2={top} {...accent} />
          <line x1={left} y1={top} x2={left} y2={bottom} {...accent} />
          <line x1={right} y1={top} x2={right} y2={bottom} {...accent} />
          <path d={`M ${left} ${bottom} Q 0 ${top + d * 0.48} ${right} ${bottom}`} {...fine} strokeDasharray="3 3" />
          {/* Drain */}
          <circle cx={0} cy={0} r={small * 0.075} {...body} />
          <line x1={-small * 0.045} y1={0} x2={small * 0.045} y2={0} {...fine} />
          <line x1={0} y1={-small * 0.045} x2={0} y2={small * 0.045} {...fine} />
        </g>
      );

    case "desk":
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.3} {...body} />
          {/* Monitor */}
          <rect x={left + w * 0.28} y={top + d * 0.08} width={w * 0.44} height={d * 0.18} rx={r * 0.2} {...body} />
          <line x1={0} y1={top + d * 0.26} x2={0} y2={top + d * 0.31} {...fine} />
          <line x1={-w * 0.07} y1={top + d * 0.31} x2={w * 0.07} y2={top + d * 0.31} {...fine} />
          {/* Keyboard */}
          <rect x={left + w * 0.27} y={top + d * 0.43} width={w * 0.46} height={d * 0.14} rx={d * 0.025} {...detail} />
          {Array.from({ length: 7 }, (_, i) => (
            <line key={i} x1={left + w * (0.31 + i * 0.06)} y1={top + d * 0.46} x2={left + w * (0.31 + i * 0.06)} y2={top + d * 0.54} {...fine} />
          ))}
          {/* Drawers */}
          <rect x={left + w * 0.05} y={top + d * 0.67} width={w * 0.22} height={d * 0.22} rx={r * 0.2} {...detail} />
          <line x1={left + w * 0.09} y1={top + d * 0.78} x2={left + w * 0.23} y2={top + d * 0.78} {...fine} />
          <circle cx={left + w * 0.16} cy={top + d * 0.72} r={small * 0.018} fill={INK} />
        </g>
      );

    case "plant": {
      const potW = small * 0.34;
      const potH = small * 0.25;
      const stemY = -potH * 0.15;
      const leaves = [
        [-0.38, -0.18, -35],
        [-0.2, -0.48, -65],
        [0, -0.58, 0],
        [0.2, -0.48, 65],
        [0.38, -0.18, 35],
        [-0.3, 0.05, -75],
        [0.3, 0.05, 75],
      ];

      return (
        <g>
          {/* Pot */}
          <path
            d={`M ${-potW / 2} ${bottom - potH}
                L ${potW / 2} ${bottom - potH}
                L ${potW * 0.38} ${bottom}
                L ${-potW * 0.38} ${bottom}
                Z`}
            {...body}
          />
          <ellipse cx={0} cy={bottom - potH} rx={potW / 2} ry={potH * 0.22} {...detail} />

          {/* Stems */}
          {leaves.map(([x, y], i) => (
            <line key={`stem-${i}`} x1={0} y1={stemY} x2={x * small} y2={y * small} {...fine} />
          ))}

          {/* Leaves */}
          {leaves.map(([x, y, rot], i) => (
            <ellipse
              key={`leaf-${i}`}
              cx={x * small}
              cy={y * small}
              rx={small * 0.075}
              ry={small * 0.18}
              transform={`rotate(${rot} ${x * small} ${y * small})`}
              fill="var(--color-plant)"
              stroke={INK}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      );
    }

    case "lamp": {
      const radius = small * 0.44;
      return (
        <g>
          <circle cx={0} cy={0} r={radius} {...body} />
          <circle cx={0} cy={0} r={radius * 0.34} {...detail} />
          <line x1={-radius} y1={0} x2={radius} y2={0} {...fine} />
          <line x1={0} y1={-radius} x2={0} y2={radius} {...fine} />
          <path d={`M ${-radius * 0.72} ${radius * 0.72} Q 0 ${radius * 0.45} ${radius * 0.72} ${radius * 0.72}`} {...fine} />
        </g>
      );
    }

    case "piano": {
      const keys = d * 0.25;
      const keyCount = Math.max(8, Math.min(18, Math.round(w / (small * 0.12))));
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.45} {...body} />
          <rect x={left + w * 0.035} y={top + d * 0.05} width={w * 0.93} height={d * 0.13} rx={r * 0.2} {...detail} />
          <rect x={left} y={bottom - keys} width={w} height={keys} {...detail} />
          {Array.from({ length: keyCount - 1 }, (_, i) => {
            const x = left + ((i + 1) * w) / keyCount;
            return <line key={i} x1={x} y1={bottom - keys} x2={x} y2={bottom} {...fine} />;
          })}
          {Array.from({ length: Math.max(3, Math.floor(keyCount * 0.55)) }, (_, i) => {
            const x = left + w * 0.09 + i * (w * 0.82) / Math.max(2, Math.floor(keyCount * 0.55) - 1);
            return <rect key={i} x={x} y={bottom - keys} width={w * 0.035} height={keys * 0.55} fill={INK} />;
          })}
          <line x1={left + w * 0.12} y1={top + d * 0.18} x2={right - w * 0.12} y2={top + d * 0.18} {...fine} />
        </g>
      );
    }

    case "ottoman": {
      const inset = small * 0.08;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 1.8} {...body} />
          <rect x={left + inset} y={top + inset} width={w - inset * 2} height={d - inset * 2} rx={r * 1.2} {...detail} />
          <path d={`M ${left + w * 0.18} ${bottom - d * 0.14} Q 0 ${bottom - d * 0.07} ${right - w * 0.18} ${bottom - d * 0.14}`} {...fine} />
          <circle cx={left + w * 0.12} cy={bottom - d * 0.1} r={small * 0.025} fill={INK} />
          <circle cx={right - w * 0.12} cy={bottom - d * 0.1} r={small * 0.025} fill={INK} />
        </g>
      );
    }

    case "recliner": {
      const arm = Math.min(w * 0.15, d * 0.22);
      const back = d * 0.3;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 1.8} {...body} />
          <rect x={left + arm} y={top + back * 0.78} width={w - arm * 2} height={d * 0.42} rx={r} {...detail} />
          <path d={`M ${left + arm} ${top + back} Q 0 ${top + back * 0.35} ${right - arm} ${top + back}`} {...detail} />
          <path d={`M ${left + w * 0.2} ${bottom - d * 0.08} Q 0 ${bottom + d * 0.02} ${right - w * 0.2} ${bottom - d * 0.08}`} {...fine} />
          <line x1={left + arm * 0.6} y1={top + d * 0.35} x2={left + arm * 0.6} y2={bottom - d * 0.08} {...fine} />
          <line x1={right - arm * 0.6} y1={top + d * 0.35} x2={right - arm * 0.6} y2={bottom - d * 0.08} {...fine} />
        </g>
      );
    }

    case "chaise": {
      const arm = Math.min(w * 0.13, d * 0.2);
      const back = d * 0.25;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 1.7} {...body} />
          <path d={`M ${left + arm} ${top + back} Q ${left + w * 0.48} ${top + back * 0.45} ${right - arm} ${top + back}`} {...detail} />
          <path d={`M ${left + arm} ${top + back + d * 0.05} H ${right - w * 0.1}`} {...fine} />
          <path d={`M ${left + w * 0.1} ${bottom - d * 0.1} Q ${left + w * 0.48} ${bottom} ${right - w * 0.1} ${bottom - d * 0.1}`} {...fine} />
          <path d={`M ${left} ${top + back} Q ${left - w * 0.01} ${top + d * 0.52} ${left + arm} ${top + d * 0.54}`} {...body} />
        </g>
      );
    }

    case "bench": {
      const leg = Math.min(small * 0.08, w * 0.06);
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r} {...body} />
          <line x1={left + w * 0.08} y1={top + d * 0.34} x2={right - w * 0.08} y2={top + d * 0.34} {...detail} />
          <line x1={left + w * 0.08} y1={bottom - d * 0.34} x2={right - w * 0.08} y2={bottom - d * 0.34} {...detail} />
          {[left + w * 0.14, right - w * 0.14].map((x, i) => (
            <rect key={i} x={x - leg / 2} y={bottom - d * 0.12} width={leg} height={d * 0.1} fill={INK} />
          ))}
        </g>
      );
    }

    case "sideTable": {
      const inset = small * 0.08;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 1.4} {...body} />
          <rect x={left + inset} y={top + inset} width={w - inset * 2} height={d - inset * 2} rx={r} {...detail} />
          <circle cx={left + w * 0.18} cy={top + d * 0.18} r={small * 0.035} fill={INK} />
          <circle cx={right - w * 0.18} cy={top + d * 0.18} r={small * 0.035} fill={INK} />
        </g>
      );
    }

    case "consoleTable": {
      const drawerH = d * 0.28;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r} {...body} />
          <line x1={left} y1={top + drawerH} x2={right} y2={top + drawerH} {...detail} />
          <line x1={0} y1={top} x2={0} y2={top + drawerH} {...detail} />
          <circle cx={left + w * 0.25} cy={top + drawerH * 0.52} r={small * 0.025} fill={INK} />
          <circle cx={right - w * 0.25} cy={top + drawerH * 0.52} r={small * 0.025} fill={INK} />
          {[left + w * 0.12, right - w * 0.12].map((x, i) => (
            <line key={i} x1={x} y1={bottom - d * 0.16} x2={x} y2={bottom} {...accent} />
          ))}
        </g>
      );
    }

    case "nightstand": {
      const drawer = d * 0.3;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r} {...body} />
          <line x1={left} y1={top + drawer} x2={right} y2={top + drawer} {...detail} />
          <line x1={left} y1={top + drawer * 2} x2={right} y2={top + drawer * 2} {...detail} />
          <circle cx={0} cy={top + drawer * 0.5} r={small * 0.025} fill={INK} />
          <circle cx={0} cy={top + drawer * 1.5} r={small * 0.025} fill={INK} />
          <line x1={left + w * 0.12} y1={bottom - d * 0.1} x2={left + w * 0.12} y2={bottom} {...fine} />
          <line x1={right - w * 0.12} y1={bottom - d * 0.1} x2={right - w * 0.12} y2={bottom} {...fine} />
        </g>
      );
    }

    case "dresser": {
      const rows = Math.max(2, Math.min(4, Math.round(d / Math.max(w * 0.32, 0.5))));
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r} {...body} />
          {Array.from({ length: rows }, (_, i) => {
            const y = top + ((i + 1) * d) / rows;
            return (
              <g key={i}>
                <line x1={left} y1={y} x2={right} y2={y} {...detail} />
                <circle cx={0} cy={y - d / rows / 2} r={small * 0.025} fill={INK} />
              </g>
            );
          })}
          <line x1={left + w * 0.08} y1={bottom - d * 0.08} x2={right - w * 0.08} y2={bottom - d * 0.08} {...fine} />
        </g>
      );
    }

    case "vanity": {
      const mirrorH = d * 0.28;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r} {...body} />
          <rect x={left + w * 0.16} y={top + d * 0.06} width={w * 0.68} height={mirrorH} rx={r * 0.6} {...detail} />
          <line x1={left + w * 0.16} y1={top + mirrorH + d * 0.16} x2={right - w * 0.16} y2={top + mirrorH + d * 0.16} {...detail} />
          <line x1={0} y1={top + mirrorH + d * 0.16} x2={0} y2={bottom - d * 0.12} {...fine} />
          <circle cx={left + w * 0.25} cy={bottom - d * 0.18} r={small * 0.025} fill={INK} />
          <circle cx={right - w * 0.25} cy={bottom - d * 0.18} r={small * 0.025} fill={INK} />
        </g>
      );
    }

    case "barStool": {
      const radius = small * 0.42;
      return (
        <g>
          <circle cx={0} cy={0} r={radius} {...body} />
          <circle cx={0} cy={0} r={radius * 0.68} {...detail} />
          <line x1={-radius * 0.5} y1={radius * 0.92} x2={radius * 0.5} y2={radius * 0.92} {...accent} />
          <line x1={-radius * 0.42} y1={-radius * 0.92} x2={radius * 0.42} y2={-radius * 0.92} {...fine} />
        </g>
      );
    }

    case "kitchenIsland": {
      const counter = d * 0.18;
      const stools = Math.max(2, Math.min(4, Math.round(w / Math.max(d * 0.75, 0.7))));
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r} {...body} />
          <rect x={left + w * 0.04} y={top + d * 0.06} width={w * 0.92} height={counter} rx={r * 0.45} {...detail} />
          <line x1={left + w * 0.08} y1={top + d * 0.48} x2={right - w * 0.08} y2={top + d * 0.48} {...fine} />
          {Array.from({ length: stools }, (_, i) => {
            const x = left + w * 0.14 + (i * w * 0.72) / Math.max(1, stools - 1);
            return <circle key={i} cx={x} cy={bottom + d * 0.2} r={small * 0.09} {...detail} />;
          })}
        </g>
      );
    }

    case "meetingTable": {
      const chairs = Math.max(2, Math.min(6, Math.round(w / Math.max(d * 1.35, 0.9))));
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={Math.min(r * 2, d * 0.3)} {...body} />
          <rect x={left + w * 0.06} y={top + d * 0.12} width={w * 0.88} height={d * 0.76} rx={r} {...detail} />
          {Array.from({ length: chairs }, (_, i) => {
            const x = left + w * 0.12 + (i * w * 0.76) / Math.max(1, chairs - 1);
            return (
              <g key={i}>
                <rect x={x - d * 0.12} y={top - d * 0.22} width={d * 0.24} height={d * 0.16} rx={d * 0.05} {...body} />
                <rect x={x - d * 0.12} y={bottom + d * 0.06} width={d * 0.24} height={d * 0.16} rx={d * 0.05} {...body} />
              </g>
            );
          })}
        </g>
      );
    }

    case "filingCabinet": {
      const drawers = Math.max(2, Math.min(4, Math.round(d / Math.max(w * 0.45, 0.5))));
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.6} {...body} />
          {Array.from({ length: drawers }, (_, i) => {
            const y = top + (i * d) / drawers;
            return (
              <g key={i}>
                <rect x={left + w * 0.08} y={y + d * 0.04} width={w * 0.84} height={d / drawers - d * 0.08} rx={r * 0.3} {...detail} />
                <line x1={left + w * 0.38} y1={y + d / drawers / 2} x2={right - w * 0.38} y2={y + d / drawers / 2} {...fine} />
              </g>
            );
          })}
        </g>
      );
    }

    case "bunkBed": {
      const head = d * 0.08;
      const divider = top + d * 0.5;
      const pillowW = w * 0.34;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r * 0.7} {...body} />
          <rect x={left} y={top} width={w} height={head} {...body} />
          <line x1={left} y1={divider} x2={right} y2={divider} {...accent} />
          <rect x={left + w * 0.1} y={top + head + d * 0.04} width={pillowW} height={d * 0.12} rx={d * 0.025} {...detail} />
          <rect x={left + w * 0.1} y={divider + d * 0.05} width={pillowW} height={d * 0.12} rx={d * 0.025} {...detail} />
          <line x1={right - w * 0.12} y1={top + d * 0.1} x2={right - w * 0.12} y2={bottom - d * 0.1} {...fine} />
          <line x1={left + w * 0.16} y1={top + d * 0.25} x2={right - w * 0.16} y2={top + d * 0.25} {...fine} />
          <line x1={left + w * 0.16} y1={divider + d * 0.25} x2={right - w * 0.16} y2={divider + d * 0.25} {...fine} />
        </g>
      );
    }

    case "crib": {
      const railGap = Math.max(small * 0.11, w * 0.07);
      const mattress = d * 0.12;
      return (
        <g>
          <rect x={left} y={top} width={w} height={d} rx={r} {...body} />
          <rect x={left + w * 0.1} y={top + d * 0.12} width={w * 0.8} height={d * 0.72} rx={r * 0.4} {...detail} />
          {Array.from({ length: Math.max(4, Math.floor(w / railGap)) }, (_, i) => {
            const x = left + w * 0.06 + (i * w * 0.88) / Math.max(1, Math.floor(w / railGap) - 1);
            return <line key={i} x1={x} y1={top} x2={x} y2={bottom} {...fine} />;
          })}
          <line x1={left + w * 0.12} y1={top + mattress} x2={right - w * 0.12} y2={top + mattress} {...accent} />
          <line x1={left + w * 0.12} y1={bottom - mattress} x2={right - w * 0.12} y2={bottom - mattress} {...accent} />
        </g>
      );
    }

    default:
      // Keeps the renderer safe if the catalog contains a future symbol type.
      return <rect x={left} y={top} width={w} height={d} rx={r} {...body} />;
  }
}