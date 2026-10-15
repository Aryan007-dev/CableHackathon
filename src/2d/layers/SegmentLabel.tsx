import { PX_PER_METER, formatLength } from "../../units";
import type { LengthUnit } from "../../units";
import type { Point } from "../planGeometry";

// Length label for one straight wall segment: centred on it, pushed off the
// line, and rotated to run along it (flipped so text is never upside down).
export default function SegmentLabel({ a, b, unit }: { a: Point; b: Point; unit: LengthUnit }) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;

    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;

    const offset = 20;
    const x = (a[0] + b[0]) / 2 + (-dy / len) * offset;
    const y = (a[1] + b[1]) / 2 + (dx / len) * offset;

    const text = formatLength(len / PX_PER_METER, unit);
    const boxWidth = text.length * 9 + 16;

    return (
        <g transform={`translate(${x} ${y}) rotate(${angle})`}>
            <rect
                x={-boxWidth / 2}
                y={-12}
                width={boxWidth}
                height={24}
                rx={6}
                fill="var(--color-dimension-soft)"
                stroke="var(--color-dimension)"
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
    );
}
