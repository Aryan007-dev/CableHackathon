import { useCallback, useEffect, useRef, useState } from "react";

import type { Point } from "./planGeometry";
import { screenToPlanPoint } from "./electricalPlan";
import { isTypingInField } from "./usePlanKeyboard";

type SvgPointerEvent = React.PointerEvent<SVGSVGElement>;

// Pan and zoom for the plan's SVG. The view is one `translate(pan) scale(scale)`
// on the drawing group; plan coordinates themselves never change.
export function usePanZoom() {
    const svgRef = useRef<SVGSVGElement>(null);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState<Point>([0, 0]);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState<Point | null>(null);
    const [panOrigin, setPanOrigin] = useState<Point>([0, 0]);
    const [spaceHeld, setSpaceHeld] = useState(false);

    // Latest pan/zoom for the native wheel listener, which outlives renders.
    const view = useRef({ pan, scale });
    useEffect(() => {
        view.current = { pan, scale };
    }, [pan, scale]);

    // Zoom by `factor` while keeping the world point under (screenX, screenY) fixed.
    const zoomAt = useCallback((screenX: number, screenY: number, factor: number) => {
        const current = view.current;
        const newScale = Math.min(10, Math.max(0.1, current.scale * factor));
        const worldX = (screenX - current.pan[0]) / current.scale;
        const worldY = (screenY - current.pan[1]) / current.scale;
        const newPan: Point = [screenX - worldX * newScale, screenY - worldY * newScale];

        view.current = { pan: newPan, scale: newScale };
        setScale(newScale);
        setPan(newPan);
    }, []);

    // Show the world box [x1, y1]-[x2, y2] whole, centred, with a margin;
    // `right` keeps that many pixels clear on the right (a floating panel).
    const fitTo = useCallback((x1: number, y1: number, x2: number, y2: number, margin = 60, right = 0) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect || x2 <= x1 || y2 <= y1) return;
        const width = rect.width - right;
        const fit = Math.min((width - 2 * margin) / (x2 - x1), (rect.height - 2 * margin) / (y2 - y1));
        const newScale = Math.min(10, Math.max(0.1, fit));
        const newPan: Point = [
            width / 2 - ((x1 + x2) / 2) * newScale,
            rect.height / 2 - ((y1 + y2) / 2) * newScale,
        ];
        view.current = { pan: newPan, scale: newScale };
        setScale(newScale);
        setPan(newPan);
    }, []);

    const zoomAtCenter = (factor: number) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) zoomAt(rect.width / 2, rect.height / 2, factor);
    };

    // React registers wheel listeners as passive, so preventDefault() in an
    // onWheel prop is ignored. Attach a native non-passive listener instead.
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 0.9);
        };

        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
    }, [zoomAt]);

    // Hold Space to pan with any tool (and don't scroll the page).
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== " " || isTypingInField()) return;
            e.preventDefault();
            setSpaceHeld(true);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === " ") setSpaceHeld(false);
        };
        // Releasing Space in another window would otherwise leave panning stuck on.
        const onBlur = () => setSpaceHeld(false);

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, []);

    // Convert screen coordinates to floor-plan/world coordinates. Using
    // clientX/clientY instead of offsetX/offsetY makes this much more
    // reliable when the SVG contains nested elements and when zooming.
    const toWorld = (e: SvgPointerEvent | React.MouseEvent<SVGSVGElement>): Point => {
        const svgRect = e.currentTarget.getBoundingClientRect();
        const screenX = e.clientX - svgRect.left;
        const screenY = e.clientY - svgRect.top;

        return screenToPlanPoint([screenX, screenY], pan, scale);
    };

    const startPan = (e: SvgPointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsPanning(true);
        setPanStart([e.clientX, e.clientY]);
        setPanOrigin(pan);
    };

    // Moves the view if a pan drag is in progress; returns whether it was.
    const updatePan = (e: SvgPointerEvent) => {
        if (!isPanning || !panStart) return false;
        setPan([panOrigin[0] + e.clientX - panStart[0], panOrigin[1] + e.clientY - panStart[1]]);
        return true;
    };

    const endPan = () => {
        setIsPanning(false);
        setPanStart(null);
    };

    return { svgRef, scale, pan, isPanning, spaceHeld, zoomAtCenter, fitTo, toWorld, startPan, updatePan, endPan };
}
