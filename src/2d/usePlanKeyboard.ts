import { useEffect, useRef } from "react";

import { TOOL_SHORTCUTS } from "./planConstants";
import type { Tool } from "./ToolSideBar";

// Shortcuts must not fire while the user is typing (e.g. in the library search).
export const isTypingInField = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

// What the plan does for each shortcut. A handler returning false didn't apply
// (e.g. Delete with nothing selected), so the key isn't swallowed.
export type PlanKeyHandlers = {
    onEscape: () => void;
    onDelete: () => boolean;
    onSelectAll: () => boolean;
    onFlipDoors: () => boolean; // F
    onRotate: (step: number) => boolean; // E / Shift+E
    onTool: (tool: Tool) => void;
};

export function usePlanKeyboard(handlers: PlanKeyHandlers) {
    // The handlers close over fresh state every render. Keep the latest in a ref
    // so the window listener is added once instead of on every render.
    const latest = useRef(handlers);
    useEffect(() => {
        latest.current = handlers;
    });

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (isTypingInField()) return;
            const h = latest.current;
            const key = e.key.toLowerCase();

            if (e.key === "Escape") {
                h.onEscape();
                return;
            }

            if (e.key === "Delete" || e.key === "Backspace") {
                if (h.onDelete()) e.preventDefault();
                return;
            }

            // Cmd/Ctrl+A selects everything on the plan.
            if ((e.metaKey || e.ctrlKey) && key === "a") {
                if (h.onSelectAll()) e.preventDefault();
                return;
            }

            if (e.metaKey || e.ctrlKey || e.altKey) return;

            if (key === "f" && h.onFlipDoors()) return;
            if (key === "e" && h.onRotate(e.shiftKey ? -90 : 90)) return;

            const tool = TOOL_SHORTCUTS[key];
            if (tool) h.onTool(tool);
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}
