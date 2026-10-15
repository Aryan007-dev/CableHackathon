import { PX_PER_METER, formatArea, formatLength } from "../../units";
import type { LengthUnit } from "../../units";
import type { Rectangle } from "../planGeometry";

const DIMENSION_COLOR = "var(--color-dimension)";
const DIMENSION_OFFSET = 35; // how far the dimension lines sit outside the room
const LABEL_GAP = 16;

// A dimension line with a 45° tick at each end.
function DimensionLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
    return (
        <>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIMENSION_COLOR} strokeWidth={2} />
            <line x1={x1 - 7} y1={y1 - 7} x2={x1 + 7} y2={y1 + 7} stroke={DIMENSION_COLOR} strokeWidth={2} />
            <line x1={x2 - 7} y1={y2 - 7} x2={x2 + 7} y2={y2 + 7} stroke={DIMENSION_COLOR} strokeWidth={2} />
        </>
    );
}

// One rectangle room's labels: its area in the middle (unless something else
// labels the room there), its width above and its height to the right.
function RoomLabel({ r, units, showArea }: { r: Rectangle; units: LengthUnit; showArea: boolean }) {
    const left = Math.min(r.x1, r.x2);
    const right = Math.max(r.x1, r.x2);
    const top = Math.min(r.y1, r.y2);
    const bottom = Math.max(r.y1, r.y2);
    const widthInMeters = (right - left) / PX_PER_METER;
    const heightInMeters = (bottom - top) / PX_PER_METER;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const heightLabelX = right + DIMENSION_OFFSET + LABEL_GAP;

    return (
        <g>
            {/* Room area */}
            {showArea && (
                <>
                    <rect x={centerX - 95} y={centerY - 24} width={190} height={48} fill="var(--color-surface)" stroke="var(--color-border-strong)" strokeWidth={1} />
                    <text x={centerX} y={centerY + 8} textAnchor="middle" fill="var(--color-dimension-text)" fontSize={22} fontWeight="bold" fontFamily="monospace">
                        {formatArea(widthInMeters * heightInMeters, units)}
                    </text>
                </>
            )}

            {/* Top width dimension */}
            <DimensionLine x1={left} y1={top - DIMENSION_OFFSET} x2={right} y2={top - DIMENSION_OFFSET} />
            <rect
                x={centerX - 65}
                y={top - DIMENSION_OFFSET - LABEL_GAP - 20}
                width={130}
                height={30}
                rx={8}
                fill="var(--color-dimension-soft)"
                stroke={DIMENSION_COLOR}
                strokeWidth={2}
            />
            <text
                x={centerX}
                y={top - DIMENSION_OFFSET - LABEL_GAP + 1}
                textAnchor="middle"
                fill="var(--color-dimension-text)"
                fontSize={18}
                fontWeight="bold"
                fontFamily="monospace"
            >
                {formatLength(widthInMeters, units)}
            </text>

            {/* Right height dimension */}
            <line x1={right + DIMENSION_OFFSET} y1={top} x2={right + DIMENSION_OFFSET} y2={bottom} stroke={DIMENSION_COLOR} strokeWidth={2} />
            <line
                x1={right + DIMENSION_OFFSET - 7}
                y1={top + 7}
                x2={right + DIMENSION_OFFSET + 7}
                y2={top - 7}
                stroke={DIMENSION_COLOR}
                strokeWidth={2}
            />
            <line
                x1={right + DIMENSION_OFFSET - 7}
                y1={bottom + 7}
                x2={right + DIMENSION_OFFSET + 7}
                y2={bottom - 7}
                stroke={DIMENSION_COLOR}
                strokeWidth={2}
            />
            <rect
                x={heightLabelX - 15}
                y={centerY - 65}
                width={30}
                height={130}
                rx={8}
                fill="var(--color-dimension-soft)"
                stroke={DIMENSION_COLOR}
                strokeWidth={2}
            />
            <text
                x={heightLabelX}
                y={centerY}
                textAnchor="middle"
                fill="var(--color-dimension-text)"
                fontSize={18}
                fontWeight="bold"
                fontFamily="monospace"
                transform={`rotate(90 ${heightLabelX} ${centerY})`}
            >
                {formatLength(heightInMeters, units)}
            </text>
        </g>
    );
}

// showArea: false while a routed cable plan of this drawing labels each room
// (name, area, node, hub) at the same spot.
export default function RoomLabels({ rectangles, units, showArea = true }: { rectangles: Rectangle[]; units: LengthUnit; showArea?: boolean }) {
    return (
        <>
            {rectangles.map((r, i) => (
                <RoomLabel key={`rectangle-${i}`} r={r} units={units} showArea={showArea} />
            ))}
        </>
    );
}
