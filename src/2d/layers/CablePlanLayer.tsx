import { useRef, useState } from "react";

import { useEditor } from "../../store";
import { formatArea, formatLength } from "../../units";
import type { LengthUnit } from "../../units";
import { moveHub } from "../../cable/cableActions";
import { insidePolygon } from "../planGeometry";
import { fromPlan, hubOfNode, hubVar, problemsToDraw, ringsToDraw, roomEdges, shapePath, toPlan } from "../../cable/cablePlan";
import type { CableLayers, CablePlan, CableShape, XY } from "../../cable/cablePlan";
import "../../cable/cable.css";

// An imported Cable Ring plan, in two layers so the editor's own drawing sits
// between them: CableRoomsLayer goes under the editor's walls, and
// CableOverlayLayer (cables, labels, markers) on top of everything but the
// selection.
//
// With the Select tool, hubs, nodes and rings can be clicked to inspect one
// hub's ring (the others dim), and a hub can be dragged: the solver re-routes
// around its new spot. Everything else ignores the pointer.

const DIM = 0.15; // opacity of what isn't the inspected hub's

function Shapes({ plan, shapes, fill, stroke }: { plan: CablePlan; shapes: CableShape[]; fill: string; stroke?: string }) {
    return (
        <>
            {shapes.map((s, i) => (
                <path key={i} d={shapePath(plan, s)} fill={fill} fillRule="evenodd" stroke={stroke} strokeWidth={stroke ? 1 : 0} />
            ))}
        </>
    );
}

// Room floors (tinted by the hub that serves them), then walls, doors, windows.
export function CableRoomsLayer({ plan, layers }: { plan: CablePlan; layers: CableLayers }) {
    const focus = useEditor((s) => s.cableFocus);
    if (!layers.rooms) return null;
    return (
        <g pointerEvents="none">
            {plan.rooms.map((r, i) => (
                <g key={i}>
                    <path d={shapePath(plan, r.shape)} fill="var(--color-cable-room)" fillRule="evenodd" />
                    {r.hub_id && (
                        <path
                            d={shapePath(plan, r.shape)}
                            fill={hubVar(r.hub_id)}
                            fillOpacity={focus && focus !== r.hub_id ? 0.04 : focus ? 0.24 : 0.14}
                            fillRule="evenodd"
                        />
                    )}
                </g>
            ))}
            <Shapes plan={plan} shapes={plan.walls} fill="var(--color-cable-wall)" />
            <Shapes plan={plan} shapes={[...plan.doors, ...plan.front_doors]} fill="var(--color-canvas)" stroke="var(--color-cable-wall)" />
            <Shapes plan={plan} shapes={plan.windows} fill="var(--color-cable-window)" stroke="var(--color-cable-wall)" />
        </g>
    );
}

const halo = { stroke: "var(--color-canvas)", strokeWidth: 3, paintOrder: "stroke" } as const;

type OverlayProps = { plan: CablePlan; layers: CableLayers; units: LengthUnit; interactive: boolean };

// Rings, then room labels over them, then problem markers, nodes and hubs.
export function CableOverlayLayer({ plan, layers, units, interactive }: OverlayProps) {
    const focus = useEditor((s) => s.cableFocus);
    const setFocus = useEditor((s) => s.setCableFocus);
    const busy = useEditor((s) => s.cableBusy);
    const group = useRef<SVGGElement>(null);
    // A hub being dragged: where it is now, in plan pixels.
    const [drag, setDrag] = useState<{ hubId: string; from: XY; at: XY } | null>(null);

    const hubOf = hubOfNode(plan);
    const rings = ringsToDraw(plan, layers.compare);
    const problems = problemsToDraw(plan, layers.compare);
    const opacity = (hubId: string | null) => (focus && hubId !== focus ? DIM : 1);
    const toggleFocus = (hubId: string | null) => setFocus(hubId && hubId !== focus ? hubId : null);
    const canEdit = interactive && !busy;

    // Pointer position in plan pixels: undo the pan/zoom the group sits in.
    const toLocal = (e: React.PointerEvent): XY => {
        const m = group.current?.getScreenCTM();
        if (!m) return [0, 0];
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
        return [p.x, p.y];
    };

    // Clicks here are the cable plan's, not the editor's (no marquee, no wall).
    const own = (e: React.PointerEvent) => e.stopPropagation();

    // While a hub is dragged: the rooms it may stand in (the ones it serves),
    // and whether the cursor is in one of them.
    const zoneRooms = drag ? plan.rooms.filter((r) => r.hub_id === drag.hubId) : [];
    const dropOk = !!drag && zoneRooms.some((r) => insidePolygon(drag.at, r.shape.outer.map((p) => toPlan(plan, p))));

    return (
        <g ref={group} pointerEvents="none" fontFamily="system-ui, sans-serif">
            {layers.cables &&
                rings.map(({ hub, points, naive }) => {
                    const line = points.map((p) => toPlan(plan, p).join(",")).join(" ");
                    const both = layers.compare === "both";
                    return (
                        <g key={`${hub.hub_id}-${naive ? "naive" : "final"}`} opacity={opacity(hub.hub_id)}>
                            <polyline
                                points={line}
                                fill="none"
                                stroke={hubVar(hub.hub_id)}
                                strokeWidth={naive && both ? 2 : 3}
                                strokeDasharray={naive && both ? "7 5" : undefined}
                                strokeOpacity={naive && both ? 0.6 : 0.9}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                            {layers.animate && !(naive && both) && (
                                // White dashes marching hub -> N1 -> ... -> hub.
                                <polyline className="cable-pulse" points={line} fill="none" stroke="#ffffff"
                                    strokeWidth={2} strokeDasharray="3 21" strokeLinecap="round" />
                            )}
                            {/* A wide invisible stroke, so the thin ring is easy to click. */}
                            {interactive && !naive && (
                                <polyline points={line} fill="none" stroke="transparent" strokeWidth={12}
                                    pointerEvents="stroke" style={{ cursor: "pointer" }}
                                    onPointerDown={(e) => { own(e); toggleFocus(hub.hub_id); }} />
                            )}
                        </g>
                    );
                })}

            {/* Wall lengths inside each room. A drawn plan already has the
                editor's own dimension lines, so it doesn't get a second set. */}
            {layers.dimensions && plan.source?.kind !== "drawn" &&
                plan.rooms.flatMap((r, i) =>
                    roomEdges(r).map((edge, k) => {
                        const a = toPlan(plan, edge.a);
                        const b = toPlan(plan, edge.b);
                        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
                        const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
                        const [nx, ny] = [edge.inward[0], -edge.inward[1]]; // plan y runs down
                        const inset = 10;
                        const trim = 6;
                        const p = (t: number, off: number) => [a[0] + ux * t + nx * off, a[1] + uy * t + ny * off];
                        let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
                        if (angle > 90) angle -= 180;
                        if (angle <= -90) angle += 180;
                        const [s1, s2] = [p(trim, inset), p(len - trim, inset)];
                        const [tx, ty] = p(len / 2, inset + 9);
                        return (
                            <g key={`d${i}-${k}`} stroke="var(--color-dimension)" strokeWidth={1}>
                                <line x1={s1[0]} y1={s1[1]} x2={s2[0]} y2={s2[1]} />
                                <line x1={p(trim, inset - 4)[0]} y1={p(trim, inset - 4)[1]} x2={p(trim, inset + 4)[0]} y2={p(trim, inset + 4)[1]} />
                                <line x1={p(len - trim, inset - 4)[0]} y1={p(len - trim, inset - 4)[1]} x2={p(len - trim, inset + 4)[0]} y2={p(len - trim, inset + 4)[1]} />
                                <text x={tx} y={ty} transform={`rotate(${angle} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="middle"
                                    fontSize={10} fill="var(--color-dimension-text)" {...halo}>
                                    {formatLength(edge.length, units)}
                                </text>
                            </g>
                        );
                    })
                )}

            {layers.labels &&
                plan.rooms.map((r, i) => {
                    const [x, y] = toPlan(plan, r.label_at);
                    // Rooms with a node: which one, and which hub serves it.
                    const detail = r.room_id
                        ? `${formatArea(r.area_m2, units)} · ${r.room_id}${r.hub_id ? ` → ${r.hub_id}` : ""}`
                        : formatArea(r.area_m2, units);
                    return (
                        // Pushed up so the node marker (at the same deep point
                        // of the room, usually) stays readable below it.
                        <g key={i} transform={`translate(${x} ${y - 22})`} textAnchor="middle" opacity={r.hub_id ? opacity(r.hub_id) : 1}>
                            <text fontSize={15} fontWeight={600} fill="var(--color-cable-label)" {...halo}>{r.label}</text>
                            <text y={15} fontSize={11} fill="var(--color-ink-muted)" {...halo}>{detail}</text>
                        </g>
                    );
                })}

            {layers.cables && layers.problems && problems && (
                <g>
                    {problems.overlaps.map((seg, i) => (
                        <polyline key={`o${i}`} points={seg.map((p) => toPlan(plan, p).join(",")).join(" ")}
                            fill="none" stroke="var(--color-warning)" strokeWidth={8} strokeOpacity={0.45} strokeLinecap="round" />
                    ))}
                    {problems.crossings.map((p, i) => {
                        const [x, y] = toPlan(plan, p);
                        return (
                            <g key={`x${i}`} transform={`translate(${x} ${y})`} stroke="var(--color-warning)" strokeWidth={2.5}>
                                <circle r={9} fill="var(--color-warning-soft)" fillOpacity={0.6} />
                                <line x1={-4} y1={-4} x2={4} y2={4} />
                                <line x1={-4} y1={4} x2={4} y2={-4} />
                            </g>
                        );
                    })}
                </g>
            )}

            {drag && (
                <g>
                    {zoneRooms.map((r, i) => (
                        <path key={i} d={shapePath(plan, r.shape)} fill={hubVar(drag.hubId)} fillOpacity={0.22} fillRule="evenodd"
                            stroke={hubVar(drag.hubId)} strokeWidth={2.5} strokeDasharray="8 5" />
                    ))}
                    <text x={drag.at[0]} y={drag.at[1] - 16} textAnchor="middle" fontSize={11} fontWeight={600}
                        fill={dropOk ? "var(--color-cable-label)" : "var(--color-warning)"} {...halo}>
                        {dropOk ? "Drop to re-route" : "Outside its rooms: it will snap back to them"}
                    </text>
                </g>
            )}

            {layers.cables && (
                <>
                    {plan.nodes.map((n) => {
                        const [x, y] = toPlan(plan, [n.x, n.y]);
                        const hubId = hubOf[n.node_id] ?? null;
                        return (
                            <g key={n.node_id} transform={`translate(${x} ${y})`} opacity={opacity(hubId)}
                                pointerEvents={interactive ? "all" : "none"} style={interactive ? { cursor: "pointer" } : undefined}
                                onPointerDown={(e) => { own(e); toggleFocus(hubId); }}>
                                <circle r={6} fill="var(--color-surface)" stroke={hubVar(hubId)} strokeWidth={3} />
                                <text x={9} y={4} fontSize={10} fontWeight={600} fill="var(--color-cable-label)" {...halo}>{n.node_id}</text>
                            </g>
                        );
                    })}

                    {plan.hubs.map((h) => {
                        const [x, y] = drag?.hubId === h.hub_id ? drag.at : toPlan(plan, [h.x, h.y]);
                        return (
                            <g
                                key={`hub-${h.hub_id}`}
                                transform={`translate(${x} ${y})`}
                                opacity={opacity(h.hub_id)}
                                pointerEvents={interactive ? "all" : "none"}
                                style={interactive ? { cursor: canEdit ? (drag ? "grabbing" : "grab") : "wait" } : undefined}
                                onPointerDown={(e) => {
                                    own(e);
                                    if (!canEdit) return;
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                    const at = toLocal(e);
                                    setDrag({ hubId: h.hub_id, from: at, at });
                                }}
                                onPointerMove={(e) => {
                                    if (!drag) return;
                                    own(e);
                                    setDrag({ ...drag, at: toLocal(e) });
                                }}
                                onPointerUp={(e) => {
                                    if (!drag) return;
                                    own(e);
                                    e.currentTarget.releasePointerCapture(e.pointerId);
                                    const moved = Math.hypot(drag.at[0] - drag.from[0], drag.at[1] - drag.from[1]) > 4;
                                    setDrag(null);
                                    if (!moved) toggleFocus(h.hub_id);
                                    else {
                                        const [mx, my] = fromPlan(plan, drag.at);
                                        void moveHub(h.hub_id, mx, my);
                                    }
                                }}
                            >
                                <rect x={-9} y={-9} width={18} height={18} rx={3}
                                    fill={drag?.hubId === h.hub_id && !dropOk ? "var(--color-warning)" : hubVar(h.hub_id)}
                                    stroke="var(--color-surface)" strokeWidth={2}
                                    strokeDasharray={drag?.hubId === h.hub_id ? "3 2" : undefined} />
                                <text y={4} fontSize={9} fontWeight={700} textAnchor="middle" fill="var(--color-accent-contrast)">{h.hub_id}</text>
                            </g>
                        );
                    })}
                </>
            )}
        </g>
    );
}
