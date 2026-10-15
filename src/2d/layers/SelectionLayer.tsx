import { WALL_EDGE_WIDTH } from "../planConstants";
import { furnitureCorners, openingPlacement } from "../planGeometry";
import type { Point } from "../planGeometry";
import { itemExists, itemKey } from "../planSelection";
import type { PlanItem, PlanSnapshot } from "../planSelection";

const HIGHLIGHT = "var(--color-selection)";

type SelectionLayerProps = {
    plan: PlanSnapshot;
    selection: PlanItem[];
    hoverTarget: PlanItem | null;
    // Hover highlights are hidden while dragging or box-selecting.
    allowHover: boolean;
    scale: number;
    rotateHandle: { base: Point; knob: Point } | null;
    marquee: { start: Point; current: Point } | null;
};

// Select tool overlays: selected items (strong), the hovered item (faint), the
// rotate knob of a lone selected piece, and the selection box. Handles and
// lines keep the same on-screen size at any zoom.
export default function SelectionLayer({
    plan,
    selection,
    hoverTarget,
    allowHover,
    scale,
    rotateHandle,
    marquee,
}: SelectionLayerProps) {
    const { points, walls, openings, furniture } = plan;
    const handleSize = 10 / scale;

    const corner = ([x, y]: Point, key: string, strong: boolean) =>
        strong ? (
            <rect
                key={key}
                x={x - handleSize / 2}
                y={y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill={HIGHLIGHT}
                stroke="var(--color-symbol-fill)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
            />
        ) : (
            <circle
                key={key}
                cx={x}
                cy={y}
                r={handleSize}
                fill="none"
                stroke={HIGHLIGHT}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
            />
        );

    const wallLine = ([a, b]: [Point, Point], key: string, strong: boolean) => (
        <g key={key}>
            <line
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke={HIGHLIGHT}
                strokeOpacity={strong ? 1 : 0.45}
                strokeWidth={6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
            />
            {strong && corner(a, "a", true)}
            {strong && corner(b, "b", true)}
        </g>
    );

    // Draw one item: `strong` when selected, faint when only hovered.
    const drawItem = (item: PlanItem, strong: boolean) => {
        const key = `${strong ? "selected" : "hover"}-${itemKey(item)}`;

        if (item.kind === "point") return corner(points[item.index], key, strong);
        if (item.kind === "segment") return wallLine([points[item.index - 1], points[item.index]], key, strong);
        if (item.kind === "wall") return wallLine([walls[item.index].a, walls[item.index].b], key, strong);

        if (item.kind === "furniture") {
            const piece = furniture.find((f) => f.id === item.id);
            if (!piece) return null;
            return (
                <polygon
                    key={key}
                    points={furnitureCorners(piece).map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke={HIGHLIGHT}
                    strokeOpacity={strong ? 1 : 0.45}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                />
            );
        }

        if (item.kind === "opening") {
            const opening = openings.find((o) => o.id === item.id);
            const place = opening && openingPlacement(opening, walls);
            if (!place) return null;
            const halfWidth = place.widthPx / 2 + 3;
            return (
                <rect
                    key={key}
                    transform={`translate(${place.center[0]} ${place.center[1]}) rotate(${place.angle})`}
                    x={-halfWidth}
                    y={-(WALL_EDGE_WIDTH / 2 + 4)}
                    width={halfWidth * 2}
                    height={WALL_EDGE_WIDTH + 8}
                    fill="none"
                    stroke={HIGHLIGHT}
                    strokeOpacity={strong ? 1 : 0.45}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                />
            );
        }

        return corner(walls[item.index][item.end], key, strong);
    };

    const selectedKeys = new Set(selection.map(itemKey));
    const showHover =
        hoverTarget && allowHover && !selectedKeys.has(itemKey(hoverTarget)) && itemExists(hoverTarget, plan);

    return (
        <>
            <g pointerEvents="none">
                {showHover && drawItem(hoverTarget, false)}
                {selection.map((item) => drawItem(item, true))}
                {rotateHandle && (
                    <g>
                        <line
                            x1={rotateHandle.base[0]}
                            y1={rotateHandle.base[1]}
                            x2={rotateHandle.knob[0]}
                            y2={rotateHandle.knob[1]}
                            stroke={HIGHLIGHT}
                            strokeWidth={1.5}
                            vectorEffect="non-scaling-stroke"
                        />
                        <circle
                            cx={rotateHandle.knob[0]}
                            cy={rotateHandle.knob[1]}
                            r={6 / scale}
                            fill="var(--color-surface)"
                            stroke={HIGHLIGHT}
                            strokeWidth={2}
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                )}
            </g>

            {marquee && (
                <rect
                    x={Math.min(marquee.start[0], marquee.current[0])}
                    y={Math.min(marquee.start[1], marquee.current[1])}
                    width={Math.abs(marquee.current[0] - marquee.start[0])}
                    height={Math.abs(marquee.current[1] - marquee.start[1])}
                    fill={HIGHLIGHT}
                    fillOpacity={0.08}
                    stroke={HIGHLIGHT}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                />
            )}
        </>
    );
}
