import type { Point } from "../planGeometry";

// Angle readout for the wall currently being drawn, shown as an arc at the
// corner the new wall grows from, with the degrees in a pill beside it.
//
// With a previous wall it measures the CORNER between the two, so you can see
// when you've hit a square 90 degrees. With no previous wall there is no corner
// yet, so it measures from horizontal instead.
//
// Both cases draw the arc the SHORT way round and label it with exactly the
// angle that arc spans, so the picture and the number can never disagree.
export default function AngleIndicator({
    from,
    to,
    previous,
}: {
    from: Point;
    to: Point;
    previous: Point | null;
}) {
    const liveLen = Math.hypot(to[0] - from[0], to[1] - from[1]);
    // Nothing meaningful to measure until the wall has some length.
    if (liveLen < 8) return null;

    const liveAngle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const prevLen = previous ? Math.hypot(previous[0] - from[0], previous[1] - from[1]) : Infinity;

    // Measure from the previous wall when there is one, else from horizontal.
    const start = previous ? liveAngle : 0;
    const end = previous ? Math.atan2(previous[1] - from[1], previous[0] - from[0]) : liveAngle;

    // Shortest signed turn from `start` to `end`, wrapped into (-PI, PI].
    let delta = end - start;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;

    // Keep the arc inside both walls so it never overshoots a short one.
    const radius = Math.min(36, liveLen * 0.45, prevLen * 0.45);
    if (radius < 8) return null;

    const at = (angle: number, r: number): Point => [
        from[0] + Math.cos(angle) * r,
        from[1] + Math.sin(angle) * r,
    ];

    const [x1, y1] = at(start, radius);
    const [x2, y2] = at(end, radius);
    // |delta| <= PI, so the arc is never the long way round (large-arc flag 0).
    const sweep = delta > 0 ? 1 : 0;

    const degrees = Math.round(Math.abs(delta) * (180 / Math.PI) * 10) / 10;
    // Right angles are what you're usually aiming for, so call them out.
    const square = Math.abs(degrees - 90) < 0.5;
    const color = square ? "var(--color-selection)" : "var(--color-drawing)";

    const [labelX, labelY] = at(start + delta / 2, radius + 20);
    const text = `${degrees}°`;
    const boxWidth = text.length * 9 + 16;

    return (
        <g pointerEvents="none">
            <path
                d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 ${sweep} ${x2} ${y2}`}
                fill="none"
                stroke={color}
                strokeWidth={2}
            />
            {/* Short ticks joining the arc to each wall, so it reads as an angle
                rather than a stray curve. */}
            <line x1={from[0]} y1={from[1]} x2={x1} y2={y1} stroke={color} strokeWidth={1} opacity={0.6} />
            <line x1={from[0]} y1={from[1]} x2={x2} y2={y2} stroke={color} strokeWidth={1} opacity={0.6} />

            <g transform={`translate(${labelX} ${labelY})`}>
                <rect
                    x={-boxWidth / 2}
                    y={-12}
                    width={boxWidth}
                    height={24}
                    rx={6}
                    fill="var(--color-dimension-soft)"
                    stroke={color}
                    strokeWidth={1.5}
                />
                <text
                    y={5}
                    textAnchor="middle"
                    fill="var(--color-dimension-text)"
                    fontSize={14}
                    fontWeight="bold"
                    fontFamily="monospace"
                >
                    {text}
                </text>
            </g>
        </g>
    );
}
