import type { Opening, PlanWall } from "../../store";
import type { LengthUnit } from "../../units";
import { wallLengthPieces } from "../planGeometry";
import type { Point } from "../planGeometry";
import SegmentLabel from "./SegmentLabel";

type LengthLabelsProps = {
    points: Point[];
    // Freehand wall labels are skipped when the outline is drawn as a rectangle room.
    showFreehand: boolean;
    // The wall being drawn with the Wall tool, from its last corner to the cursor.
    liveSegment: [Point, Point] | null;
    walls: PlanWall[];
    openings: Opening[];
    // Walls of intact rectangle rooms, which have their own dimension lines.
    roomWallIndexes: Set<number>;
    units: LengthUnit;
};

export default function LengthLabels({
    points,
    showFreehand,
    liveSegment,
    walls,
    openings,
    roomWallIndexes,
    units,
}: LengthLabelsProps) {
    return (
        <>
            {showFreehand && points.slice(1).map((p, i) => (
                <SegmentLabel key={`segment-${i}`} a={points[i]} b={p} unit={units} />
            ))}

            {liveSegment && <SegmentLabel a={liveSegment[0]} b={liveSegment[1]} unit={units} />}

            {/* A wall outside an intact room gets one label; any wall with
                doors/windows is split into wall | opening | wall. */}
            {walls.flatMap((w, index) => {
                const pieces = wallLengthPieces(w, openings);
                if (pieces.length === 1 && roomWallIndexes.has(index)) return [];
                return pieces.map(([a, b], i) => (
                    <SegmentLabel key={`wall-length-${index}-${i}`} a={a} b={b} unit={units} />
                ));
            })}
        </>
    );
}
