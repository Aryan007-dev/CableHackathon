import { PX_PER_FOOT, PX_PER_METER } from "../units";
import type { LengthUnit } from "../units";
import type { Tool } from "./ToolSideBar";

// Clicking within this many plan pixels of an existing freehand corner joins it.
export const CLOSE_DIST = 10;

// Grab tolerance in on-screen pixels (divided by zoom before use).
export const HIT_PX = 8;

// The 2D equivalent of the 3D wall thickness.
export const WALL_WIDTH = 5;

// Every wall is drawn as a dark band with a light core on top, which reads as
// two parallel lines with a gap: the look of a rectangle room's edge (a 3px
// outer line, a 3px inner line WALL_WIDTH further in). All dark bands go down
// before any light core, so walls that meet join without a seam.
export const WALL_EDGE_COLOR = "var(--color-wall-edge)";
export const WALL_CORE_COLOR = "var(--color-wall-core)";
export const WALL_EDGE_WIDTH = WALL_WIDTH + 3;
export const WALL_CORE_WIDTH = WALL_WIDTH - 3;

// Snap step and grid spacing (plan pixels) follow the display unit, so a room
// drawn in metres lands on round metric lengths. Major must be a whole
// multiple of minor or the two SVG grid patterns drift apart.
export const PLAN_GRID: Record<LengthUnit, { snap: number; minor: number; major: number }> = {
    ft: { snap: PX_PER_FOOT, minor: PX_PER_FOOT, major: 5 * PX_PER_FOOT }, // 1 ft snap, 1 ft / 5 ft lines
    m: { snap: 0.1 * PX_PER_METER, minor: 0.5 * PX_PER_METER, major: PX_PER_METER }, // 10 cm snap, 0.5 m / 1 m lines
};

// Keyboard shortcuts, matching the keys shown in the tool sidebar.
export const TOOL_SHORTCUTS: Record<string, Tool> = {
    v: "select",
    h: "pan",
    w: "wall",
    r: "rectangle",
    g: "polygon",
    d: "door",
    n: "window",
    c: "wire",
    m: "measure",
    l: "furniture",
};
