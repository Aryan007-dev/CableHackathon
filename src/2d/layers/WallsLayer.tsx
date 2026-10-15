import type { PlanWall } from "../../store";
import { WALL_CORE_COLOR, WALL_CORE_WIDTH, WALL_EDGE_COLOR, WALL_EDGE_WIDTH } from "../planConstants";
import type { Point, Rectangle } from "../planGeometry";

type WallsLayerProps = {
    // Room floors to fill under the walls.
    floors: Rectangle[];
    // The freehand outline, and whether to draw it closed (when it forms a rectangle).
    points: Point[];
    closeOutline: boolean;
    walls: PlanWall[];
};

// Room floors, then every wall in the same double-line look: all the dark
// bands first, then all the light cores, so walls that meet join cleanly.
export default function WallsLayer({ floors, points, closeOutline, walls }: WallsLayerProps) {
    const outline = points.map((p) => p.join(",")).join(" ");

    return (
        <>
            {floors.map((r, i) => (
                <rect
                    key={`floor-${i}`}
                    x={Math.min(r.x1, r.x2)}
                    y={Math.min(r.y1, r.y2)}
                    width={Math.abs(r.x2 - r.x1)}
                    height={Math.abs(r.y2 - r.y1)}
                    fill="var(--color-room-floor)"
                />
            ))}

            {([
                ["edge", WALL_EDGE_COLOR, WALL_EDGE_WIDTH],
                ["core", WALL_CORE_COLOR, WALL_CORE_WIDTH],
            ] as const).map(([layer, color, width]) => (
                <g
                    key={`walls-${layer}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={width}
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                >
                    {points.length > 1 && (closeOutline ? <polygon points={outline} /> : <polyline points={outline} />)}
                    {walls.map((w, i) => (
                        <line key={`${layer}-${i}`} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} />
                    ))}
                </g>
            ))}
        </>
    );
}
