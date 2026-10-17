import { useEffect, useMemo, useRef, useState } from "react";

import { useEditor, OPENING_DEFAULTS } from "../store";
import type { PlanWall } from "../store";
import { InfoBox } from "../InfoBox";
import FurnitureLibraryPanel from "./FurnitureLibraryPanel";
import ToolSideBar from "./ToolSideBar";
import type { Tool } from "./ToolSideBar";
import { SYMBOL_BY_ID } from "./symbolLibrary";
import { createElectricalPlacement } from "./electricalPlan";
import { HIT_PX, PLAN_GRID } from "./planConstants";
import {
    distance,
    findOpeningSpot,
    findRooms,
    normalizeAngle,
    pointKey,
    rectangleFromPoints,
    resolvePoint,
    rotateHandlePoints,
    snap,
} from "./planGeometry";
import type { OpeningSpot, Point } from "./planGeometry";
import {
    deleteItems,
    flipDoors,
    hitTest,
    itemExists,
    itemKey,
    itemsInBox,
    moveSelection,
    rotateFurniture,
} from "./planSelection";
import type { PlanItem, PlanSnapshot } from "./planSelection";
import { usePanZoom } from "./usePanZoom";
import { frameKey, solutionView, toPlan } from "../cable/cablePlan";

// The cable panel's width plus its gap (src/cable/CablePanel.module.css).
const CABLE_PANEL_WIDTH = 312;
import { CableOverlayLayer, CableRoomsLayer } from "./layers/CablePlanLayer";
import { usePlanKeyboard } from "./usePlanKeyboard";
import AngleIndicator from "./layers/AngleIndicator";
import FurnitureLayer from "./layers/FurnitureLayer";
import GridLayer from "./layers/GridLayer";
import LengthLabels from "./layers/LengthLabels";
import OpeningsLayer from "./layers/OpeningsLayer";
import RoomLabels from "./layers/RoomLabels";
import SelectionLayer from "./layers/SelectionLayer";
import WallsLayer from "./layers/WallsLayer";

type SvgPointerEvent = React.PointerEvent<SVGSVGElement>;

const releaseCapture = (e: SvgPointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
    }
};

function FloorPlan() {
    // Freehand points remain in doc.floorPlan. Rooms drawn with the Rectangle
    // tool are stored as four independent walls in doc.planWalls, so they never
    // connect to the freehand polyline and each wall can be edited alone.
    const storedPoints = useEditor((s) => s.doc.floorPlan);
    const storedWalls = useEditor((s) => s.doc.planWalls);
    const storedOpenings = useEditor((s) => s.doc.openings);
    const storedFurniture = useEditor((s) => s.doc.planFurniture);
    const setPoints = useEditor((s) => s.setFloorPlan);
    const addRectangle = useEditor((s) => s.addRectangle);
    const addOpening = useEditor((s) => s.addOpening);
    const addPlanFurniture = useEditor((s) => s.addPlanFurniture);
    const setPlan = useEditor((s) => s.setPlan);
    const units = useEditor((s) => s.units);
    const dismissedTips = useEditor((s) => s.dismissedTips);
    const dismissTip = useEditor((s) => s.dismissTip);
    const grid = PLAN_GRID[units];
    const cablePlan = useEditor((s) => s.doc.cablePlan);
    const cableLayers = useEditor((s) => s.cableLayers);
    // The solution being shown (ours or a baseline), and one to overlay under it.
    const { solution, overlay } = cableLayers;
    const cableView = useMemo(() => cablePlan && solutionView(cablePlan, solution), [cablePlan, solution]);
    const cableOverlay = useMemo(
        () => (cablePlan && overlay && overlay !== solution ? solutionView(cablePlan, overlay) : null),
        [cablePlan, overlay, solution]
    );

    const { svgRef, scale, pan, isPanning, spaceHeld, zoomAtCenter, fitTo, toWorld, startPan, updatePan, endPan } = usePanZoom();

    // Frame a newly imported cable plan, but not a re-solve of the same one
    // (a dragged hub comes back as a new object with the same extent).
    const cableExtent = cablePlan ? frameKey(cablePlan) : null;
    const latestCable = useRef(cablePlan);
    useEffect(() => {
        latestCable.current = cablePlan;
    });
    useEffect(() => {
        const plan = latestCable.current;
        if (!plan) return;
        const { min_x, min_y, max_x, max_y } = plan.bounds;
        const [x1, y1] = toPlan(plan, [min_x, max_y]);
        const [x2, y2] = toPlan(plan, [max_x, min_y]);
        fitTo(x1, y1, x2, y2, 60, CABLE_PANEL_WIDTH); // clear of the cable panel
    }, [cableExtent, fitTo]);

    const [activeTool, setActiveTool] = useState<Tool>("select");
    // This controls only measurements drawn on the 2D canvas. Cable panel
    // layer settings and 3D measurements keep their existing behavior.
    const [showMeasurements, setShowMeasurements] = useState(false);

    // Drawing tools.
    const [rectStart, setRectStart] = useState<Point | null>(null);
    const [rectCurrent, setRectCurrent] = useState<Point | null>(null);
    const [isRectDrawing, setIsRectDrawing] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hover, setHover] = useState<Point | null>(null);

    // Select tool. `preview` holds the dragged plan until pointer-up, so a
    // whole drag is ONE store commit (one undo step), not one per mouse move.
    const [selection, setSelection] = useState<PlanItem[]>([]);
    const [hoverTarget, setHoverTarget] = useState<PlanItem | null>(null);
    // `narrowTo`: what to select instead if the press ends without moving.
    const [drag, setDrag] = useState<{ items: PlanItem[]; start: Point; narrowTo: PlanItem[] | null } | null>(null);
    const [preview, setPreview] = useState<PlanSnapshot | null>(null);
    // Rubber-band selection box in world coords. `base` is what was already
    // selected when it started (Shift+drag adds to it).
    const [marquee, setMarquee] = useState<{ start: Point; current: Point; base: PlanItem[] } | null>(null);

    // Door/Window tool: where the new opening would go.
    const [openingGhost, setOpeningGhost] = useState<OpeningSpot | null>(null);

    // Furniture library: whether the panel is open, the piece picked from it and
    // waiting to be placed (with its rotation), and where the cursor would drop it.
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [pendingSymbol, setPendingSymbol] = useState<{ symbolId: string; rotation: number } | null>(null);
    const [placementPoint, setPlacementPoint] = useState<Point | null>(null);
    // Dragging the rotate knob of a selected piece.
    const [rotating, setRotating] = useState<{ id: string } | null>(null);

    const stored: PlanSnapshot = {
        points: storedPoints,
        walls: storedWalls,
        openings: storedOpenings,
        furniture: storedFurniture,
    };
    // What's on screen: the drag preview while dragging, otherwise the store.
    const plan = preview ?? stored;
    const { points, walls, openings, furniture } = plan;
    const activeSelection = selection.filter((item) => itemExists(item, plan));

    const showFloortip = !dismissedTips.includes("floorTip");
    const polylineRectangle = rectangleFromPoints(points);

    // Rectangle rooms whose four walls are still intact get the full room
    // drawing; every other wall is drawn on its own with a length label.
    const rooms = findRooms(walls);
    const roomWallIndexes = new Set(rooms.flatMap((room) => room.wallIndexes));
    const displayedRectangles = [
        ...rooms.map((room) => room.rectangle),
        ...(polylineRectangle ? [polylineRectangle] : []),
    ];
    const wallCorners = [...new Map(walls.flatMap((w) => [w.a, w.b]).map((p) => [pointKey(p), p])).values()];

    // The wall being drawn with the Wall tool, from its last corner to the cursor.
    const liveWall: [Point, Point] | null =
        isDrawing && activeTool === "wall" && points.length > 0 && hover ? [points[points.length - 1], hover] : null;

    // The rotate knob shows for a lone selected piece of furniture.
    const rotateHandle = (() => {
        if (activeTool !== "select" || activeSelection.length !== 1) return null;
        const only = activeSelection[0];
        if (only.kind !== "furniture") return null;
        const piece = furniture.find((f) => f.id === only.id);
        return piece ? { piece, ...rotateHandlePoints(piece, scale) } : null;
    })();

    const snapPoint = ([x, y]: Point): Point => [snap(x, grid.snap), snap(y, grid.snap)];

    // Save a whole plan snapshot as one undo step.
    const commit = (next: PlanSnapshot) =>
        setPlan({ floorPlan: next.points, planWalls: next.walls, openings: next.openings, planFurniture: next.furniture });

    // Finish the chain the Wall tool is drawing.
    //
    // doc.floorPlan is a SINGLE implicit loop of points, so it cannot hold two
    // unconnected chains. Just hiding the preview would leave the old points in
    // place and the next click would join them. So ending a chain converts it
    // into independent planWalls — which are separately selectable and can carry
    // doors and windows — and empties the freehand points, leaving the next
    // click free to start somewhere new.
    const endChain = () => {
        setIsDrawing(false);
        if (points.length === 0) return;
        if (points.length < 2) {
            setPlan({ floorPlan: [] });
            return;
        }

        // resolvePoint snaps a click onto an existing corner, so a chain closed
        // by clicking its first corner again ends with two identical points.
        const closed = points.length > 2 && pointKey(points[0]) === pointKey(points[points.length - 1]);
        const corners = closed ? points.slice(0, -1) : points;

        // Four corners forming an axis-aligned rectangle become a real room:
        // walls sharing a roomId get the floor fill and area label, exactly as
        // the Rectangle tool's do (see findRooms).
        const roomId = closed && rectangleFromPoints(points) ? crypto.randomUUID() : undefined;

        const segments: PlanWall[] = [];
        const count = closed ? corners.length : corners.length - 1;
        for (let i = 0; i < count; i++) {
            segments.push({
                id: crypto.randomUUID(),
                a: corners[i],
                b: corners[(i + 1) % corners.length],
                ...(roomId ? { roomId } : {}),
            });
        }

        setPlan({ floorPlan: [], planWalls: [...walls, ...segments] });
    };

    const changeTool = (tool: Tool) => {
        // The furniture library is a panel you open and close, not a tool you stay in.
        if (tool === "furniture") {
            setLibraryOpen((open) => !open);
            return;
        }
        // Leaving the Wall tool ends the chain too — otherwise coming back to it
        // later would carry on from the corner left behind.
        if (activeTool === "wall" && tool !== "wall") endChain();
        setActiveTool(tool);
        setSelection([]);
        setHoverTarget(null);
        setOpeningGhost(null);
    };

    usePlanKeyboard({
        onEscape: () => {
            // End the chain rather than only hiding its preview: that's what
            // frees the next click to start a new wall somewhere else.
            if (activeTool === "wall") endChain();
            setIsDrawing(false);
            endPan();
            setRectStart(null);
            setRectCurrent(null);
            setIsRectDrawing(false);
            setSelection([]);
            setMarquee(null);
            setDrag(null);
            setPreview(null);
            setOpeningGhost(null);
            setPendingSymbol(null);
            setRotating(null);
        },
        onDelete: () => {
            const items = selection.filter((item) => itemExists(item, stored));
            if (items.length === 0) return false;
            const next = deleteItems(items, stored);
            commit(next);
            if (next.points.length === 0) setIsDrawing(false);
            setSelection([]);
            // Indexes shift after a delete, so a remembered hover would point at a different wall.
            setHoverTarget(null);
            return true;
        },
        onSelectAll: () => {
            if (activeTool !== "select") return false;
            setSelection(itemsInBox([-Infinity, -Infinity], [Infinity, Infinity], stored));
            return true;
        },
        onFlipDoors: () => {
            const next = flipDoors(selection.filter((item) => itemExists(item, stored)), storedOpenings);
            if (!next) return false;
            setPlan({ openings: next });
            return true;
        },
        // The piece being placed if there is one, otherwise the selected pieces.
        onRotate: (step) => {
            if (pendingSymbol) {
                setPendingSymbol({ ...pendingSymbol, rotation: normalizeAngle(pendingSymbol.rotation + step) });
                return true;
            }
            const next = rotateFurniture(selection.filter((item) => itemExists(item, stored)), storedFurniture, step);
            if (!next) return false;
            setPlan({ planFurniture: next });
            return true;
        },
        onTool: changeTool,
    });

    const finishDrag = () => {
        if (preview) {
            // A corner dropped onto its wall's other end leaves a zero-length wall: drop it.
            commit({ ...preview, walls: preview.walls.filter((w) => pointKey(w.a) !== pointKey(w.b)) });
        } else if (drag?.narrowTo) {
            setSelection(drag.narrowTo);
        }
        setDrag(null);
        setPreview(null);
    };

    // Add a freehand point.
    const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
        // pendingSymbol: this click just placed a piece of furniture, not a wall corner.
        if (activeTool !== "wall" || spaceHeld || pendingSymbol) return;

        const [x, y] = snapPoint(toWorld(e));

        setIsDrawing(true);
        setPoints([...points, resolvePoint(x, y, points)]);
    };

    // Select tool press: rotate knob, then whatever's under the cursor, else a selection box.
    const pressSelect = (e: SvgPointerEvent) => {
        const world = toWorld(e);

        if (rotateHandle && distance(world, rotateHandle.knob) <= (HIT_PX + 2) / scale) {
            e.currentTarget.setPointerCapture(e.pointerId);
            setRotating({ id: rotateHandle.piece.id });
            return;
        }

        const hits = hitTest(world, plan, rooms, scale);
        e.currentTarget.setPointerCapture(e.pointerId);

        if (hits.length === 0) {
            // Empty floor: start a selection box. Shift keeps what's already selected.
            const base = e.shiftKey ? activeSelection : [];
            setSelection(base);
            setMarquee({ start: world, current: world, base });
            return;
        }

        const selectedKeys = new Set(activeSelection.map(itemKey));
        const hitsSelected = hits.every((item) => selectedKeys.has(itemKey(item)));
        let next: PlanItem[];

        if (e.shiftKey) {
            // Shift+click toggles the item in or out of the selection.
            const hitKeys = new Set(hits.map(itemKey));
            next = hitsSelected
                ? activeSelection.filter((item) => !hitKeys.has(itemKey(item)))
                : [...activeSelection, ...hits];
        } else {
            // Grabbing something already selected drags the whole selection.
            next = hitsSelected ? activeSelection : hits;
        }

        setSelection(next);
        if (next.length > 0 && !(e.shiftKey && hitsSelected)) {
            // A plain click (no drag) on one item inside a bigger
            // selection narrows the selection to that item.
            const narrowTo = !e.shiftKey && hitsSelected && activeSelection.length > hits.length ? hits : null;
            setDrag({ items: next, start: snapPoint(world), narrowTo });
        }
    };

    const handlePointerDown = (e: SvgPointerEvent) => {
        // Pan with the Pan tool, Space held with any tool, or middle-mouse drag.
        if (activeTool === "pan" || spaceHeld || e.button === 1) {
            e.preventDefault(); // stops middle-click autoscroll
            startPan(e);
            return;
        }

        if (e.button !== 0) return;

        // Dropping a piece picked from the furniture library, then straight
        // into Select with it picked, ready to move or rotate.
        if (pendingSymbol) {
            const symbol = SYMBOL_BY_ID[pendingSymbol.symbolId];
            const [x, y] = symbol.category === "Electrical" ? toWorld(e) : snapPoint(toWorld(e));
            const id = crypto.randomUUID();
            const placement = symbol.category === "Electrical"
                ? createElectricalPlacement(symbol.id, id, x, y, pendingSymbol.rotation)
                : { id, symbolId: symbol.id, x, y, rotation: pendingSymbol.rotation, width: symbol.width, depth: symbol.depth };
            if (!placement) return;
            addPlanFurniture(placement);
            setPendingSymbol(null);
            setPlacementPoint(null);
            setActiveTool("select");
            setSelection([{ kind: "furniture", id }]);
            return;
        }

        if (activeTool === "select") {
            pressSelect(e);
            return;
        }

        if (activeTool === "door" || activeTool === "window") {
            if (openingGhost && !openingGhost.blocked) {
                addOpening({
                    id: crypto.randomUUID(),
                    kind: activeTool,
                    wallId: openingGhost.wallId,
                    offset: openingGhost.offset,
                    ...OPENING_DEFAULTS[activeTool],
                });
                // The spot is taken now, until the cursor moves elsewhere.
                setOpeningGhost({ ...openingGhost, blocked: true });
            }
            return;
        }

        if (activeTool !== "rectangle") return;

        e.currentTarget.setPointerCapture(e.pointerId);
        const start = snapPoint(toWorld(e));
        setRectStart(start);
        setRectCurrent(start);
        setIsRectDrawing(true);
    };

    const handlePointerMove = (e: SvgPointerEvent) => {
        if (updatePan(e)) return;

        const world = toWorld(e);
        const current = snapPoint(world);

        setHover(current);

        if (pendingSymbol) {
            setPlacementPoint(current);
            return;
        }

        if (rotating) {
            const piece = storedFurniture.find((f) => f.id === rotating.id);
            if (piece) {
                // Point the knob at the cursor: snaps to 15° steps, Shift for free rotation.
                const raw = (Math.atan2(world[1] - piece.y, world[0] - piece.x) * 180) / Math.PI + 90;
                const rotation = normalizeAngle(e.shiftKey ? Math.round(raw) : Math.round(raw / 15) * 15);
                setPreview({ ...stored, furniture: storedFurniture.map((f) => (f.id === piece.id ? { ...f, rotation } : f)) });
            }
            return;
        }

        if (activeTool === "select") {
            if (marquee) {
                // Live: everything fully inside the box is selected as it grows.
                const baseKeys = new Set(marquee.base.map(itemKey));
                const boxItems = itemsInBox(marquee.start, world, stored);
                setMarquee({ ...marquee, current: world });
                setSelection([...marquee.base, ...boxItems.filter((item) => !baseKeys.has(itemKey(item)))]);
            } else if (drag) {
                // Only preview once the cursor reaches another snap
                // cell, so a plain click never nudges anything.
                const dx = current[0] - drag.start[0];
                const dy = current[1] - drag.start[1];
                setPreview(dx || dy ? moveSelection(drag.items, stored, dx, dy) : null);
            } else {
                setHoverTarget(hitTest(world, plan, rooms, scale)[0] ?? null);
            }
            return;
        }

        if (activeTool === "door" || activeTool === "window") {
            setOpeningGhost(findOpeningSpot(world, activeTool, walls, openings, scale, grid.snap));
            return;
        }

        // Update rectangle preview while dragging.
        if (activeTool === "rectangle" && isRectDrawing) {
            setRectCurrent(current);
        }
    };

    const handlePointerUp = (e: SvgPointerEvent) => {
        if (isPanning) {
            endPan();
            releaseCapture(e);
            return;
        }

        if (rotating) {
            // The whole turn is one undo step.
            if (preview) setPlan({ planFurniture: preview.furniture });
            setRotating(null);
            setPreview(null);
            releaseCapture(e);
            return;
        }

        if (marquee) {
            setMarquee(null);
            releaseCapture(e);
            return;
        }

        if (drag) {
            finishDrag();
            releaseCapture(e);
            return;
        }

        if (activeTool !== "rectangle" || !isRectDrawing || !rectStart || !rectCurrent) {
            return;
        }

        const [x1, y1] = rectStart;
        const [x2, y2] = rectCurrent;

        if (x1 !== x2 && y1 !== y2) {
            // Stored as four independent walls (see addRectangle),
            // never connected to the freehand polyline.
            addRectangle({ x1, y1, x2, y2 });
        }

        setRectStart(null);
        setRectCurrent(null);
        setIsRectDrawing(false);
        releaseCapture(e);
    };

    const handlePointerCancel = (e: SvgPointerEvent) => {
        endPan();
        setRectStart(null);
        setRectCurrent(null);
        setIsRectDrawing(false);
        setDrag(null);
        setPreview(null);
        setMarquee(null);
        setRotating(null);
        releaseCapture(e);
    };

    const handlePointerLeave = () => {
        if (!isRectDrawing) setHover(null);
        setHoverTarget(null);
        setOpeningGhost(null);
        setPlacementPoint(null);
    };

    const cursor = pendingSymbol
        ? "crosshair"
        : rotating || isPanning
            ? "grabbing"
            : activeTool === "pan" || spaceHeld
                ? "grab"
                : activeTool === "select"
                    ? drag
                        ? "grabbing"
                        : marquee
                            ? "crosshair"
                            : hoverTarget
                                ? "move"
                                : "default"
                    : "crosshair";

    return (
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
            <ToolSideBar activeTool={activeTool} onToolChange={changeTool} libraryOpen={libraryOpen} />

            <div style={{ position: "relative", width: "100%", height: "100%" }}>
                {/* ZOOM CONTROLS */}
                <div
                    style={{
                        position: "absolute",
                        top: 8,
                        // Step out from under the furniture library panel when it's open.
                        left: libraryOpen ? 316 : 8,
                        zIndex: 10,
                        display: "flex",
                        gap: 4,
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-ink)",
                        padding: "4px 8px",
                        borderRadius: 4,
                    }}
                >
                    <button onClick={() => zoomAtCenter(1.2)}>+</button>
                    <button onClick={() => zoomAtCenter(1 / 1.2)}>-</button>
                    <span style={{ fontSize: 12, lineHeight: "22px" }}>{Math.round(scale * 100)}%</span>
                    <button
                        type="button"
                        aria-pressed={showMeasurements}
                        aria-label={showMeasurements ? "Hide 2D measurements" : "Show 2D measurements"}
                        title="Show or hide lengths and room areas in 2D"
                        onClick={() => setShowMeasurements((shown) => !shown)}
                        style={{ marginLeft: 8, whiteSpace: "nowrap" }}
                    >
                        {showMeasurements ? "Hide measurements" : "Show measurements"}
                    </button>
                </div>

                {/* FLOOR TIP */}
                {showFloortip && (
                    <div style={{ position: "relative", top: 60, left: 8, zIndex: 1000 }}>
                        <InfoBox id="floorTip" onDismiss={dismissTip}>
                            Click to place corners and draw your room. Close the loop,
                            then click "Switch to 3d up in the toolbar"
                        </InfoBox>
                    </div>
                )}

                {/* FURNITURE LIBRARY */}
                {libraryOpen && (
                    <FurnitureLibraryPanel
                        units={units}
                        activeSymbolId={pendingSymbol?.symbolId ?? null}
                        onPick={(symbolId) => {
                            setPendingSymbol({ symbolId, rotation: 0 });
                            // Free the canvas from the library overlay and route
                            // the next click through placement, even if Pan was
                            // the previously active tool.
                            setLibraryOpen(false);
                            setActiveTool("select");
                            setSelection([]);
                        }}
                        onClose={() => {
                            setLibraryOpen(false);
                            setPendingSymbol(null);
                        }}
                    />
                )}

                <svg
                    ref={svgRef}
                    data-plan-svg // found by the cable plan's PNG/SVG export
                    width="100%"
                    height="100%"
                    style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        cursor,
                        touchAction: "none",
                        // Dragging would otherwise highlight the dimension label text.
                        userSelect: "none",
                        WebkitUserSelect: "none",
                    }}
                    onClick={handleClick}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onPointerLeave={handlePointerLeave}
                    // Zoom is a native wheel listener (see usePanZoom).
                >
                    {/* Layers are drawn in order: later ones sit on top. */}
                    <g transform={`translate(${pan[0]} ${pan[1]}) scale(${scale})`}>
                        <GridLayer minor={grid.minor} major={grid.major} />

                        {cableView && <CableRoomsLayer plan={cableView} layers={cableLayers} />}

                        <WallsLayer floors={displayedRectangles} points={points} closeOutline={!!polylineRectangle} walls={walls} />

                        <OpeningsLayer
                            openings={openings}
                            walls={walls}
                            preview={(activeTool === "door" || activeTool === "window") && openingGhost
                                ? { kind: activeTool, spot: openingGhost }
                                : null}
                        />

                        {/* FREEHAND PREVIEW */}
                        {liveWall && (
                            <line data-export-ignore="true"
                                x1={liveWall[0][0]}
                                y1={liveWall[0][1]}
                                x2={liveWall[1][0]}
                                y2={liveWall[1][1]}
                                stroke="var(--color-drawing)"
                                strokeWidth={3}
                                strokeLinecap="square"
                                strokeDasharray="6 4"
                            />
                        )}

                        {/* Angle of the wall being drawn, measured from the
                            previous wall when there is one. */}
                        {showMeasurements && liveWall && (
                            <g data-export-ignore="true">
                                <AngleIndicator
                                    from={liveWall[0]}
                                    to={liveWall[1]}
                                    previous={points.length >= 2 ? points[points.length - 2] : null}
                                />
                            </g>
                        )}

                        {showMeasurements && <LengthLabels
                            points={points}
                            showFreehand={!polylineRectangle}
                            liveSegment={liveWall}
                            walls={walls}
                            openings={openings}
                            roomWallIndexes={roomWallIndexes}
                            units={units}
                        />}

                        {showMeasurements && <RoomLabels
                            rectangles={displayedRectangles}
                            units={units}
                            showArea={!(cablePlan?.source?.kind === "drawn" && cableLayers.labels)}
                        />}

                        {cableView && (
                            <CableOverlayLayer
                                plan={cableView}
                                overlay={cableOverlay}
                                layers={cableLayers}
                                units={units}
                                showMeasurements={showMeasurements}
                                interactive={activeTool === "select"}
                                draggable={solution === "ours"}
                            />
                        )}

                        <FurnitureLayer
                            furniture={furniture}
                            pending={pendingSymbol && placementPoint ? { ...pendingSymbol, at: placementPoint } : null}
                        />

                        {/* RECTANGLE IN PROGRESS */}
                        {activeTool === "rectangle" && rectStart && rectCurrent && (
                            <rect data-export-ignore="true"
                                x={Math.min(rectStart[0], rectCurrent[0])}
                                y={Math.min(rectStart[1], rectCurrent[1])}
                                width={Math.abs(rectCurrent[0] - rectStart[0])}
                                height={Math.abs(rectCurrent[1] - rectStart[1])}
                                fill="var(--color-drawing)"
                                fillOpacity={0.1}
                                stroke="var(--color-drawing)"
                                strokeWidth={3}
                                strokeLinejoin="miter"
                                strokeDasharray="6 4"
                            />
                        )}

                        {/* CORNERS: freehand points and wall corners */}
                        {points.map((p, i) => (
                            <circle key={`point-${i}`} cx={p[0]} cy={p[1]} r={5} fill="var(--color-corner)" />
                        ))}
                        {wallCorners.map((p) => (
                            <circle key={`corner-${pointKey(p)}`} cx={p[0]} cy={p[1]} r={5} fill="var(--color-corner)" />
                        ))}

                        {activeTool === "select" && (
                            <g data-export-ignore="true"><SelectionLayer
                                plan={plan}
                                selection={activeSelection}
                                hoverTarget={hoverTarget}
                                allowHover={!drag && !marquee}
                                scale={scale}
                                rotateHandle={rotateHandle}
                                marquee={marquee}
                            /></g>
                        )}

                        {/* HOVER POINT (drawing tools only) */}
                        {hover && (activeTool === "wall" || activeTool === "rectangle") && !spaceHeld && !pendingSymbol && (
                            <circle data-export-ignore="true" cx={hover[0]} cy={hover[1]} r={4} fill="none" stroke="var(--color-ink)" strokeWidth={2} />
                        )}
                    </g>
                </svg>
            </div>
        </div>
    );
}

export default FloorPlan;
