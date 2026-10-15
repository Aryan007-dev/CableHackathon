import type { PlanWire } from "../../store";
import type { Point } from "../planGeometry";

type WireLayerProps = {
    wires: PlanWire[];
    selectedWireIds?: ReadonlySet<string>;
    preview?: { start: Point; end: Point } | null;
    cornerRadius?: number;
};

const endpointKey = (wireId: string, end: "start" | "end") => `${wireId}:${end}`;

export default function WireLayer({
    wires,
    selectedWireIds = new Set<string>(),
    preview = null,
    cornerRadius = 12,
}: WireLayerProps) {
    const byId = new Map(wires.map((wire) => [wire.id, wire]));
    const endpoints = wires.flatMap((wire) => [
        { wireId: wire.id, end: "start" as const, point: wire.start, connection: wire.startConnection },
        { wireId: wire.id, end: "end" as const, point: wire.end, connection: wire.endConnection },
    ]);
    const links = new Map<string, Set<string>>();
    const wallAnchors = new Map<string, string[]>();
    endpoints.forEach(({ wireId, end, connection }) => {
        const from = endpointKey(wireId, end);
        if (connection?.kind === "wall") {
            const anchor = `${connection.wallId}:${connection.end}`;
            wallAnchors.set(anchor, [...(wallAnchors.get(anchor) ?? []), from]);
            return;
        }
        if (connection?.kind !== "wire") return;
        const to = endpointKey(connection.wireId, connection.end);
        links.set(from, new Set([...(links.get(from) ?? []), to]));
        links.set(to, new Set([...(links.get(to) ?? []), from]));
    });
    for (const endpointsAtAnchor of wallAnchors.values()) {
        endpointsAtAnchor.forEach((from) => {
            links.set(from, new Set([...(links.get(from) ?? []), ...endpointsAtAnchor.filter((to) => to !== from)]));
        });
    }

    const visited = new Set<string>();
    const trims = new Map<string, Point>();
    const corners: { start: Point; control: Point; end: Point; selected: boolean; color: string; key: string }[] = [];
    for (const endpoint of endpoints) {
        const initialKey = endpointKey(endpoint.wireId, endpoint.end);
        if (visited.has(initialKey)) continue;
        const componentKeys = new Set([initialKey]);
        const queue = [initialKey];
        while (queue.length) {
            const current = queue.shift()!;
            visited.add(current);
            for (const linked of links.get(current) ?? []) {
                if (!componentKeys.has(linked)) {
                    componentKeys.add(linked);
                    queue.push(linked);
                }
            }
        }
        if (componentKeys.size !== 2) continue;
        const pair = [...componentKeys].map((key) => endpoints.find((candidate) => endpointKey(candidate.wireId, candidate.end) === key));
        if (!pair[0] || !pair[1]) continue;
        const [a, b] = pair;
        if (a.point[0] !== b.point[0] || a.point[1] !== b.point[1]) continue;
        const wireA = byId.get(a.wireId);
        const wireB = byId.get(b.wireId);
        if (!wireA || !wireB || a.wireId === b.wireId) continue;
        const otherA = wireA[a.end === "start" ? "end" : "start"];
        const otherB = wireB[b.end === "start" ? "end" : "start"];
        const lengthA = Math.hypot(otherA[0] - a.point[0], otherA[1] - a.point[1]);
        const lengthB = Math.hypot(otherB[0] - b.point[0], otherB[1] - b.point[1]);
        if (lengthA === 0 || lengthB === 0) continue;
        const radius = Math.min(cornerRadius, lengthA * 0.25, lengthB * 0.25);
        if (radius <= 0) continue;
        const trim = (other: Point, length: number): Point => [
            a.point[0] + ((other[0] - a.point[0]) / length) * radius,
            a.point[1] + ((other[1] - a.point[1]) / length) * radius,
        ];
        const trimA = trim(otherA, lengthA);
        const trimB = trim(otherB, lengthB);
        trims.set(initialKey, trimA);
        trims.set(endpointKey(b.wireId, b.end), trimB);
        corners.push({
            start: trimA,
            control: a.point,
            end: trimB,
            selected: selectedWireIds.has(a.wireId) || selectedWireIds.has(b.wireId),
            color: wireA.color,
            key: [...componentKeys].sort().join("|"),
        });
    }

    return (
        <g fill="none" strokeLinecap="round" pointerEvents="none">
            {wires.map((wire) => {
                const start = trims.get(endpointKey(wire.id, "start")) ?? wire.start;
                const end = trims.get(endpointKey(wire.id, "end")) ?? wire.end;
                const selected = selectedWireIds.has(wire.id);
                return (
                    <line
                        key={wire.id}
                        x1={start[0]}
                        y1={start[1]}
                        x2={end[0]}
                        y2={end[1]}
                        stroke={selected ? "#ffdf00" : wire.color}
                        strokeWidth={selected ? 5 : 4}
                        vectorEffect="non-scaling-stroke"
                    />
                );
            })}
            {corners.map((corner) => (
                <path
                    key={`corner-${corner.key}`}
                    d={`M ${corner.start[0]} ${corner.start[1]} Q ${corner.control[0]} ${corner.control[1]} ${corner.end[0]} ${corner.end[1]}`}
                    stroke={corner.selected ? "#ffdf00" : corner.color}
                    strokeWidth={corner.selected ? 5 : 4}
                    vectorEffect="non-scaling-stroke"
                />
            ))}
            {preview && (
                <line
                    x1={preview.start[0]}
                    y1={preview.start[1]}
                    x2={preview.end[0]}
                    y2={preview.end[1]}
                    stroke="var(--color-drawing)"
                    strokeWidth={4}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                />
            )}
        </g>
    );
}
