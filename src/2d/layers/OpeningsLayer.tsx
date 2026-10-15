import { OPENING_DEFAULTS } from "../../store";
import type { Opening, PlanWall } from "../../store";
import { WALL_EDGE_COLOR, WALL_EDGE_WIDTH } from "../planConstants";
import { openingPlacement } from "../planGeometry";
import type { OpeningPlacement, OpeningSpot } from "../planGeometry";

// A door or window drawn in its wall's own coordinates: x runs along the wall
// (the opening spans -w/2..w/2) and y across it. It paints over the wall band
// to cut the gap, closes the gap with two jamb lines, then draws the symbol.
function OpeningSymbol({
    kind,
    flip,
    place,
    tone,
}: {
    kind: Opening["kind"];
    flip?: boolean;
    place: OpeningPlacement;
    tone?: "ghost" | "blocked";
}) {
    const w = place.widthPx;
    const half = WALL_EDGE_WIDTH / 2;
    const color = tone === "blocked" ? "var(--color-warning)" : WALL_EDGE_COLOR;

    return (
        <g
            transform={`translate(${place.center[0]} ${place.center[1]}) rotate(${place.angle})`}
            opacity={tone ? 0.6 : 1}
        >
            <rect x={-w / 2} y={-half - 1} width={w} height={WALL_EDGE_WIDTH + 2} fill="var(--color-canvas)" />
            <line x1={-w / 2} y1={-half} x2={-w / 2} y2={half} stroke={color} strokeWidth={2} />
            <line x1={w / 2} y1={-half} x2={w / 2} y2={half} stroke={color} strokeWidth={2} />

            {kind === "door" ? (
                // Hinge at (-w/2, half): the open leaf sticks straight out, and the
                // arc traces its swing back to the far jamb. Flip mirrors it across the wall.
                <g transform={flip ? "scale(1 -1)" : undefined} fill="none" stroke={color}>
                    <line x1={-w / 2} y1={half} x2={-w / 2} y2={half + w} strokeWidth={2} />
                    <path d={`M ${-w / 2} ${half + w} A ${w} ${w} 0 0 0 ${w / 2} ${half}`} strokeWidth={1.5} />
                </g>
            ) : (
                // Window: a frame across the wall with a line of glass down the middle.
                <g stroke={color} strokeWidth={1}>
                    <rect x={-w / 2} y={-half} width={w} height={WALL_EDGE_WIDTH} fill="var(--color-surface)" />
                    <line x1={-w / 2} y1={0} x2={w / 2} y2={0} />
                </g>
            )}
        </g>
    );
}

type OpeningsLayerProps = {
    openings: Opening[];
    walls: PlanWall[];
    // Door/Window tool preview: red when another opening is in the way.
    preview: { kind: Opening["kind"]; spot: OpeningSpot } | null;
};

// Drawn after the walls, so each opening cuts its gap in them.
export default function OpeningsLayer({ openings, walls, preview }: OpeningsLayerProps) {
    const previewPlace = preview && openingPlacement(
        {
            id: "preview",
            kind: preview.kind,
            wallId: preview.spot.wallId,
            offset: preview.spot.offset,
            ...OPENING_DEFAULTS[preview.kind],
        },
        walls
    );

    return (
        <>
            {openings.map((o) => {
                const place = openingPlacement(o, walls);
                return place && <OpeningSymbol key={o.id} kind={o.kind} flip={o.flip} place={place} />;
            })}

            {preview && previewPlace && (
                <OpeningSymbol kind={preview.kind} place={previewPlace} tone={preview.spot.blocked ? "blocked" : "ghost"} />
            )}
        </>
    );
}
