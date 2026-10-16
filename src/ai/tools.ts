import { useEditor } from "../store";
import type { SceneNode } from "../store";
import { serializeScene } from "./serialize";
import type { Compass } from "../catalog";
import { FURNITURE_BY_ID } from "../catalog";
import { materials } from "../materials";
import { PX_PER_METER } from "../units";
import { CABLE_TOOLS } from "./describeCable";

// Describes one input parameter in JSON Schema. `type` is required; the
// rest are optional. `items` lets a parameter be an array (e.g. position),
// and it is recursive so a parameter can be an array OF arrays (e.g. a polygon
// of [x, z] points: items: { type: "array", items: { type: "number" } }).
type JsonSchemaProp = {
  type: string;
  description?: string;
  enum?: string[];
  items?: JsonSchemaProp;
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
};


function footprintFitsInsideRoom(
  x: number,
  z: number,
  w: number,
  d: number,
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  },
  margin = 0.3
) {
  const halfW = w / 2;
  const halfD = d / 2;

  return (
    x - halfW >= bounds.minX + margin &&
    x + halfW <= bounds.maxX - margin &&
    z - halfD >= bounds.minZ + margin &&
    z + halfD <= bounds.maxZ - margin
  );
}
type Tool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, JsonSchemaProp>;
    required: string[];
  };
  // `args` is the parsed JSON the AI sends. `unknown` forces us to handle it safely.
  // A handler MAY return a string (read tools like listScene) which is sent back
  // to the AI; mutating tools return nothing and get a generic success message.
  handler: (args: Record<string, unknown>) => string | void;
};

// World axes used everywhere in this app: y is up, north = -z, south = +z,
// east = +x, west = -x. A furniture GLB's "front" faces south (+z) by default,
// so to make it face a compass direction we yaw around y by this amount.
const COMPASS_YAW: Record<Compass, number> = {
  south: 0,
  north: Math.PI,
  east: -Math.PI / 2,
  west: Math.PI / 2,
};


// Turn a compass direction into a quaternion [x, y, z, w] for the store.
function compassToQuat(facing: Compass): [number, number, number, number] {
  const half = COMPASS_YAW[facing] / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

// Derive the room's x/z bounds from the actual walls (same idea as the
// system prompt). Returns null when there are no walls yet.
function roomBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const walls = Object.values(useEditor.getState().doc.nodes).filter((n) => n.type === "wall");
  const pts = walls.flatMap((w) => (w.type === "wall" ? [w.start, w.end] : []));
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[2]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
// Hard guard: is a furniture footprint [w,d] centered at (x,z) fully inside the
// walls? Returns null if OK, or an error string telling the AI what to do.
function outsideRoom(x: number, z: number, w: number, d: number): string | null {
  const b = roomBounds();

  if (!b) return null;

  // Keep the original behavior: only check whether the
  // entire furniture footprint is inside the room.
  if (!footprintFitsInsideRoom(x, z, w, d, b, 0)) {
    return `Refused: that position puts the furniture outside the room (walls are x ${b.minX}..${b.maxX}, z ${b.minZ}..${b.maxZ}). Call findFreeSpace to get a valid spot inside the walls, then retry.`;
  }

  return null;
}
function footprintOf(assetId: string): [number, number] {
  const fp = FURNITURE_BY_ID[assetId]?.footprint;
  return fp && fp.length === 2 ? [fp[0], fp[1]] : [1, 1];
}

const createRoom2d: Tool = {

  name: "createRoom2d",
  description: "Create a room in the 2D floor plan using its starting position, width, and depth.",
  input_schema: {
    type: "object",
    properties: {
      x: {
        type: "number",
        description: "starting X postion of the room in merters"

      },
      z: {
        type: "number",
        description: "starting Z postion of the room in merters"

      },
      width: {
        type: "number",
        description: "width of the room in meters must be positive "

      },
      depth: {
        type: "number",
        description: "depth of the room in merters must be postive"

      },

    },
    required: ["x", "z", "width", "depth"]



  },
  handler: (args) => {
    const x = Number(args.x);
    const z = Number(args.z);
    const width = Number(args.width);
    const depth = Number(args.depth);


    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      !Number.isFinite(width) ||
      !Number.isFinite(depth)
    ) {
      return "Error: All room dimensions and positions must be valid numbers.";
    }
    if (width <= 0 || depth <= 0) {
      return "Error room width and depth must be greater than zero"
    }
    const scale = PX_PER_METER
    const rectangle = {
      x1: x * scale,
      y1: z * scale,
      x2: (x + width) * scale,
      y2: (z + depth) * scale
    };


    const editor = useEditor.getState();
    editor.addRectangle(rectangle);


    editor.buildRoomFromPlan();

    return `Created a ${width}m by ${depth}m room.`;

  }

}
const inspectRoom: Tool = {
  name: "inspectRoom",

  description:
    "Inspect the current room layout. Returns room boundaries, dimensions, walls, furniture, and lights. Use this before planning or modifying the room.",

  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },

  handler: () => {
    const editor = useEditor.getState();
    const nodes = Object.values(editor.doc.nodes);

    // -----------------------------
    // 1. Get all walls
    // -----------------------------

    const walls = nodes.filter((node) => node.type === "wall");

    if (walls.length === 0) {
      return "There is currently no room or walls in the scene.";
    }

    // -----------------------------
    // 2. Get all wall points
    // -----------------------------

    const points = walls.flatMap((wall) =>
      wall.type === "wall" ? [wall.start, wall.end] : []
    );

    const xs = points.map((point) => point[0]);
    const zs = points.map((point) => point[2]);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    const width = maxX - minX;
    const depth = maxZ - minZ;

    // -----------------------------
    // 3. Describe the walls
    // -----------------------------

    const wallInfo = walls.map((wall, index) => {
      if (wall.type !== "wall") return "";

      const [sx, sy, sz] = wall.start;
      const [ex, ey, ez] = wall.end;

      return (
        `Wall ${index + 1}: ` +
        `(${sx}, ${sy}, ${sz}) → (${ex}, ${ey}, ${ez})`
      );
    });

    // -----------------------------
    // 4. Get furniture
    // -----------------------------

    const furniture = nodes.filter(
      (node) => node.type === "furniture"
    );

    const furnitureInfo =
      furniture.length === 0
        ? ["No furniture."]
        : furniture.map((item, index) => {
          const [x, y, z] = item.transform.position;
          const catalogItem = FURNITURE_BY_ID[item.assetId];
          const [fw, fd] = footprintOf(item.assetId);

          return (
            `Furniture ${index + 1}: ` +
            `id=${item.id}, ` +
            `name=${item.name}` +
            `label=${catalogItem?.label ?? "Unknown furniture"}, ` +
            `assetId=${item.assetId}, ` +
            `position=(${x}, ${y}, ${z}), ` +
            `footprint=${fw}m × ${fd}m`
          );
        });



    const lights = nodes.filter(
      (node) => node.type === "light"
    );

    const lightInfo =
      lights.length === 0
        ? ["No lights."]
        : lights.map((light, index) => {
          const [x, y, z] = light.transform.position;

          return (
            `Light ${index + 1}: ` +
            `id=${light.id}, ` +
            `type=${light.lightType}, ` +
            `position=(${x}, ${y}, ${z}), ` +
            `intensity=${light.intensity}, ` +
            `color=${light.color}`
          );
        });



    return [
      "ROOM INSPECTION",

      `Room dimensions: ${width.toFixed(2)}m × ${depth.toFixed(2)}m`,

      `Room bounds: x=${minX}..${maxX}, z=${minZ}..${maxZ}`,

      `Number of walls: ${walls.length}`,

      "",

      "WALLS:",
      ...wallInfo,

      "",

      `FURNITURE (${furniture.length}):`,
      ...furnitureInfo,

      "",

      `LIGHTS (${lights.length}):`,
      ...lightInfo,
    ].join("\n");
  },
};
const addFurniture: Tool = {
  name: "addFurniture",
  description: "Add a furniture model from the catalog into the scene at a chosen position.",
  input_schema: {
    type: "object",
    properties: {
      assetId: {
        type: "string",
        description: "The catalog assetId to place, e.g. round_wooden_table_02_2k",
      },
      position: {
        type: "array",
        items: { type: "number" },
        description: "[x, y, z] world position in meters. y is up; use 0 to sit on the floor.",
      },
      facing: {
        type: "string",
        description: "Which way the piece faces: north (-z), south (+z), east (+x), or west (-x). Defaults to the asset's built-in orientation if omitted.",
        enum: ["north", "south", "east", "west"],
      },
    },
    required: ["assetId"],
  },
  handler: (args) => {
    // `args` is `unknown`, so we must prove it's an array before indexing it.
    const raw = Array.isArray(args.position) ? args.position : [];
    const position: [number, number, number] = [
      Number(raw[0] ?? 0),
      Number(raw[1] ?? 0),
      Number(raw[2] ?? 0),
    ];
    // Never let the AI spawn furniture below the floor (node Y=0 == bottom on floor).
    if (position[1] < 0) position[1] = 0;

    const facing = (args.facing as Compass | undefined) ?? "south";
    const [w, d] = footprintOf(String(args.assetId));
    const err = outsideRoom(position[0], position[2], w, d);
    if (err) return err;

    // Normalize the asset to real-world size using the baked catalog scale.
    const assetScale = FURNITURE_BY_ID[String(args.assetId)]?.scale ?? 1;
    const s = Number(assetScale) || 1;

    // Build a full FurnitureNode. Annotating as SceneNode gives the object
    // literal "contextual typing": TS knows position must be a Vec3 tuple,
    // type must be the literal "furniture", etc.
    const node: SceneNode = {
      id: crypto.randomUUID(),
      name: String(args.assetId),
      parentId: null,
      type: "furniture",
      assetId: String(args.assetId),
      transform: {
        position,
        rotation: compassToQuat(facing),
        scale: [s, s, s],
      },
    };
    useEditor.getState().addNode(node);
  },
};

const undo: Tool = {
  name: "undo",
  description: "undo the last action  happend",
  input_schema: { type: "object", properties: {}, required: [] },
  handler() {
    useEditor.getState().undo()
  }
};
const addWalls: Tool = {
  name: "addWalls",
  description: "add walls to scene",
  input_schema: {
    type: "object",
    properties: {
      start: {
        type: "array",
        items: { type: "number" },
        description: "Start of the wall decide x,y,z y=0 to sit on the floor coordinates"
      },
      end: {
        type: "array",
        items: { type: "number" },
        description: "End of the wall decide x,y,z y=0 to sit on the floor coordinates"
      }

    },
    required: ["start", "end"]
  },
  handler: (args) => {
    // `args` is `unknown`, so we must prove it's an array before indexing it.
    const rawStart = Array.isArray(args.start) ? args.start : [];
    const start: [number, number, number] = [
      Number(rawStart[0] ?? 0),
      Number(0),
      Number(rawStart[2] ?? 0),
    ];
    const rawEnd = Array.isArray(args.end) ? args.end : [];
    const end: [number, number, number] = [
      Number(rawEnd[0] ?? 0),
      Number(0),
      Number(rawEnd[2] ?? 0),
    ];
    const node: SceneNode = {
      id: crypto.randomUUID(),
      name: "wall",
      parentId: null,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      type: "wall",
      start: start,
      end: end,
      materialId: "wall",
      height: 2.7,
      thickness: 0.1

    }

    // Additive: just append this one wall. The AI assembles a room by calling
    // addWalls once per wall. Use resetRoom to clear and start over.
    console.log("[addWalls] adding wall", start, "->", end);
    useEditor.getState().addNode(node);
    console.log("[addWalls] total nodes now:", Object.keys(useEditor.getState().doc.nodes).length);
  },
};

// Draw a whole room from one polygon instead of calling addWalls per wall.
// `corners` are [x, z] in METRES; we convert to SVG pixels (×PX_PER_METER) for
// the 2D floor plan, store it, then build the walls via the store action.
const drawRoom: Tool = {
  name: "drawRoom",
  description:
    "Draw a whole room at once from a polygon of corner points. Use this INSTEAD of addWalls when you know the room shape. Corners are [x, z] in metres, listed in order around the room; the last corner auto-closes to the first.",
  input_schema: {
    type: "object",
    properties: {
      corners: {
        type: "array",
        description:
          "Room corners in metres as [x, z], in order around the room. Example for a 5x5 square: [[0,0],[5,0],[5,5],[0,5]]. The last corner auto-closes back to the first.",
        items: { type: "array", items: { type: "number" } },
      },
    },
    required: ["corners"],
  },
  handler: (args) => {
    const raw = Array.isArray(args.corners) ? args.corners : [];
    const corners = raw
      .map((c) => (Array.isArray(c) ? (c as unknown[]).map(Number) : []))
      .filter((c) => c.length === 2 && c.every((n) => Number.isFinite(n))) as [number, number][];

    if (corners.length < 3) {
      return "Refused: a room needs at least 3 corner points (you gave " + corners.length + ").";
    }

    // metres → SVG pixels (buildRoomFromPlan converts back with the same constant)
    const px = corners.map(([x, z]) => [x * PX_PER_METER, z * PX_PER_METER] as [number, number]);
    console.log("[drawRoom] corners(m):", JSON.stringify(corners), "-> px:", JSON.stringify(px));
    useEditor.getState().setFloorPlan(px); // fills the 2D SVG
    useEditor.getState().buildRoomFromPlan(); // makes the walls in 3D
    return `Drew a room with ${corners.length} corners.`;
  },
};

const resetRoom: Tool = {
  name: "resetRoom",
  description: "Remove ALL walls (and only walls) from the scene, leaving furniture and lights in place. Use this before redrawing a room from scratch or making it bigger.",
  input_schema: { type: "object", properties: {}, required: [] },
  handler: () => {
    const state = useEditor.getState();
    const walls = Object.values(state.doc.nodes).filter((n) => n.type === "wall");
    if (walls.length === 0) return "There are no walls to remove.";
    walls.forEach((w) => state.removeNode(w.id));
    return `Removed ${walls.length} wall(s). You can now draw a new room with addWalls.`;
  },
};


const addlights: Tool = {
  name: "addLights",
  description: "Add lights to the scene",
  input_schema: {
    type: "object",
    properties: {
      position: {
        type: "array",
        description: "Add x ,y,z coordiantes of the room",
        items: { type: "number" }
      },
      intensity: {
        type: "number",
        description: "intensity of the light between 0 -100"
      },
      lightType: {
        type: "string",
        description: "choose a light type between point|spot|area",
        enum: ["point", "spot", "area"]
      },
      color: {
        type: "string",
        description: "an hex string defining the color off the light"
      }
    },
    required: ["position", "intensity", "color", "lightType"]
  },
  handler: (args) => {
    const intensity = Number(args.intensity ?? 20);
    const color = String(args.color ?? "#ffffff");
    const raw = Array.isArray(args.position) ? args.position : [];
    const position: [number, number, number] = [
      Number(raw[0] ?? 0),
      Number(raw[1] ?? 0),
      Number(raw[2] ?? 0),
    ];


    const node: SceneNode = {
      id: crypto.randomUUID(),
      name: "Light",
      type: "light",
      parentId: null,
      transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      lightType: args.lightType as "point" | "spot" | "area",
      intensity: intensity,
      color: color
    }
    useEditor.getState().addNode(node)
  }
}
const listScene: Tool = {
  name: "listScene",
  description:
    "List every node currently in the scene with its id, type, and position. Call this before moving or deleting anything so you know the real node ids.",
  input_schema: { type: "object", properties: {}, required: [] },
  handler: () => serializeScene(),
};

const rotateObject: Tool = {
  name: "rotateObject",
  description:
    "Rotate an existing furniture or light node so it faces a compass direction. Call listScene first to get the node id.",
  input_schema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The node id to rotate (from listScene).",
      },
      facing: {
        type: "string",
        description: "Which way to face: north (-z), south (+z), east (+x), or west (-x).",
        enum: ["north", "south", "east", "west"],
      },
    },
    required: ["id", "facing"],
  },
  handler: (args) => {
    const id = String(args.id);
    const facing = (args.facing as Compass | undefined) ?? "south";
    const node = useEditor.getState().doc.nodes[id];
    if (!node) return `No node with id ${id}.`;
    if (node.type !== "furniture" && node.type !== "light")
      return `Node ${id} is a ${node.type}; only furniture and lights can be rotated.`;
    useEditor.getState().updateNode(id, {
      transform: { ...node.transform, rotation: compassToQuat(facing) },
    } as Partial<SceneNode>);
  },
};

const moveObject: Tool = {
  name: "moveObject",
  description: "Move an existing object in the scene to a new [x, y, z] position.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The node id to move" },
      position: {
        type: "array",
        description: "Add x ,y,z coordiantes of the new point to move to",
        items: { type: "number" }
      },
    },
    required: ["id", "position"]
  },
  handler: (args) => {
    const raw = Array.isArray(args.position) ? args.position : [];
    const position: [number, number, number] = [
      Number(raw[0] ?? 0),
      Number(raw[1] ?? 0),
      Number(raw[2] ?? 0),
    ];
    const id = String(args.id)
    const node = useEditor.getState().doc.nodes[id]
    if (!node) return `No node with id ${id}.`;
    const [w, d] = node.type === "furniture" ? footprintOf(node.assetId) : [0, 0];
    const err = outsideRoom(position[0], position[2], w, d);
    if (err) return err;
    useEditor.getState().updateNode(id, {
      transform: { ...node.transform, position: position },
    } as Partial<SceneNode>);
  }
};
const deleteObject: Tool = {
  name: "deleteObject",
  description: "Permanently remove a node from the scene by id. DESTRUCTIVE — only call when the user clearly wants it gone. Call listScene first to get the id.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The node id to delete (from listScene)." },
    },
    required: ["id"],
  },
  handler: (args) => {
    const id = String(args.id);
    const node = useEditor.getState().doc.nodes[id];
    if (!node) return `No node with id ${id}.`;
    useEditor.getState().removeNode(id);
    return `Deleted ${id}.`;
  },
};
const setMaterial: Tool = {
  name: "setMaterial",
  description: "Change the surface finish of a wall, floor, or furniture node by setting its materialId to a known finish key.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The node id to repaint (from listScene)." },
      materialId: {
        type: "string",
        description: `A finish key from: ${Object.keys(materials).join(", ")}.`,
        enum: Object.keys(materials),
      },
    },
    required: ["id", "materialId"],
  },
  handler: (args) => {
    const id = String(args.id);
    const materialId = String(args.materialId);
    const node = useEditor.getState().doc.nodes[id];
    if (!node) return `No node with id ${id}.`;
    if (!(materialId in materials)) return `Unknown material '${materialId}'.`;
    useEditor.getState().updateNode(id, { materialId } as Partial<SceneNode>);
  },
};
const resizeObject: Tool = {
  name: "resizeObject",
  description: "Scale an existing furniture or light node uniformly, relative to its normal real-world size. scale 1 = normal size, 2 = twice as big, 0.5 = half.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The node id to resize (from listScene)." },
      scale: { type: "number", description: "Uniform scale factor, e.g. 1.5." },
    },
    required: ["id", "scale"],
  },
  handler: (args) => {
    const id = String(args.id);
    const scale = Number(args.scale ?? 1);
    const node = useEditor.getState().doc.nodes[id];
    if (!node) return `No node with id ${id}.`;
    if (node.type === "wall") return `Walls cannot be resized with this tool.`;
    // Furniture spawns at its baked catalog scale (e.g. 3.35), so "1" must mean
    // that size, not the raw GLB size.
    const base = node.type === "furniture" ? Number(FURNITURE_BY_ID[node.assetId]?.scale ?? 1) || 1 : 1;
    const s: [number, number, number] = [scale * base, scale * base, scale * base];
    useEditor.getState().updateNode(id, {
      transform: { ...node.transform, scale: s },
    } as Partial<SceneNode>);
  },
};
const adjustLight: Tool = {
  name: "adjustLight",
  description: "Change the intensity and/or color of an existing light node. Call listScene first to get the id.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The light node id (from listScene)." },
      intensity: { type: "number", description: "New intensity, 0-100." },
      color: { type: "string", description: "New hex color, e.g. #ffffff." },
    },
    required: ["id"],
  },
  handler: (args) => {
    const id = String(args.id);
    const node = useEditor.getState().doc.nodes[id];
    if (!node) return `No node with id ${id}.`;
    if (node.type !== "light") return `Node ${id} is a ${node.type}, not a light.`;
    const partial: Partial<Extract<SceneNode, { type: "light" }>> = {};
    if (args.intensity !== undefined) partial.intensity = Number(args.intensity);
    if (args.color !== undefined) partial.color = String(args.color);
    useEditor.getState().updateNode(id, partial as Partial<SceneNode>);
  },
}; const findFreeSpace: Tool = {
  name: "findFreeSpace",

  description:
    "Find empty floor positions inside the room where the ENTIRE furniture footprint fits inside the room and does not overlap existing furniture. Call this BEFORE addFurniture, then pass one of the exact returned positions as the new item's location. Never invent, shift, round, average, or modify a returned position.",

  input_schema: {
    type: "object",
    properties: {
      footprint: {
        type: "array",
        description:
          "Width and depth (x,z meters) of the item to place, e.g. [1, 0.8]. Defaults to [1, 1].",
        items: { type: "number" },
      },
      near: {
        type: "array",
        description:
          "Prefer free spots close to this [x, z] point (optional).",
        items: { type: "number" },
      },
      count: {
        type: "number",
        description:
          "How many candidate spots to return (default 5).",
      },
    },
    required: [],
  },

  handler: (args) => {
    const bounds = roomBounds();

    // Preserve the existing no-room fallback behavior.
    if (!bounds) {
      const nearRaw = Array.isArray(args.near) ? args.near : [];
      const nx = Number(nearRaw[0] ?? 0);
      const nz = Number(nearRaw[1] ?? 0);

      const spots = [
        [nx, nz],
        [nx + 1, nz],
        [nx - 1, nz],
        [nx, nz + 1],
        [nx, nz - 1],
      ].map(([x, z]) => `[${x}, 0, ${z}]`);

      return `No walls yet — furniture can be placed freely. Free positions (x, 0, z): ${spots.join(", ")}.`;
    }

    const count = Math.max(
      1,
      Math.floor(Number(args.count ?? 5) || 5)
    );

    const step = 0.5;
    const margin = 0.3;

    const nearRaw = Array.isArray(args.near) ? args.near : [];

    const nx = Number(
      nearRaw[0] ?? (bounds.minX + bounds.maxX) / 2
    );

    const nz = Number(
      nearRaw[1] ?? (bounds.minZ + bounds.maxZ) / 2
    );

    const fp = Array.isArray(args.footprint)
      ? args.footprint.map(Number)
      : [1, 1];

    const fw = Math.max(0.1, Number(fp[0] ?? 1));
    const fd = Math.max(0.1, Number(fp[1] ?? 1));

    // Existing furniture footprints.
    const occupied = Object.values(
      useEditor.getState().doc.nodes
    )
      .filter((n) => n.type === "furniture")
      .map((n) => {
        const [w, d] = footprintOf(n.assetId);

        return {
          x: n.transform.position[0],
          z: n.transform.position[2],
          w,
          d,
        };
      });

    const hits = (x: number, z: number) =>
      occupied.some(
        (o) =>
          Math.abs(x - o.x) < (fw + o.w) / 2 &&
          Math.abs(z - o.z) < (fd + o.d) / 2
      );

    // Calculate valid CENTER positions.
    // This accounts for half of the furniture footprint.
    const minX = bounds.minX + fw / 2 + margin;
    const maxX = bounds.maxX - fw / 2 - margin;

    const minZ = bounds.minZ + fd / 2 + margin;
    const maxZ = bounds.maxZ - fd / 2 - margin;

    if (minX > maxX || minZ > maxZ) {
      return `No free space found: a ${fw}m × ${fd}m footprint does not fit inside the room with ${margin}m wall clearance.`;
    }

    const candidates: {
      x: number;
      z: number;
      dist: number;
    }[] = [];

    for (let x = minX; x <= maxX + 1e-9; x += step) {
      for (let z = minZ; z <= maxZ + 1e-9; z += step) {

        // Make sure the entire footprint is inside the room.
        if (
          !footprintFitsInsideRoom(
            x,
            z,
            fw,
            fd,
            bounds,
            margin
          )
        ) {
          continue;
        }

        // Don't overlap existing furniture.
        if (hits(x, z)) continue;

        candidates.push({
          x: +x.toFixed(2),
          z: +z.toFixed(2),
          dist: Math.hypot(x - nx, z - nz),
        });
      }
    }

    // Nearest positions first.
    candidates.sort((a, b) => a.dist - b.dist);

    const spots = candidates
      .slice(0, count)
      .map((c) => `[${c.x}, 0, ${c.z}]`);

    if (spots.length === 0) {
      return "No free space found in the room (every valid spot overlaps existing furniture or is too close to a wall).";
    }

    return `Free positions (x, 0, z), nearest first: ${spots.join(", ")}.`;
  },
};

const planRoom: Tool = {
  name: "planRoom",
  description:
    "PLAN a room layout BEFORE building. Pass the items you intend to place with their target positions; the tool validates that every position is inside the room bounds and not overlapping existing furniture or other planned items, and reports which are valid or need adjusting. Call this FIRST, then build with addFurniture using only the validated positions.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Intended placements: [{ assetId, position: [x, y, z], facing? }]",
        items: {
          type: "object",
          properties: {
            assetId: { type: "string" },
            position: { type: "array", items: { type: "number" } },
            facing: { type: "string", enum: ["north", "south", "east", "west"] },
          },
          required: ["assetId", "position"],
        },
      },
    },
    required: ["items"],
  },
  handler: (args) => {
    const raw = Array.isArray(args.items) ? args.items : [];
    if (raw.length === 0) return "No items provided to plan.";
    const planned: { x: number; z: number; w: number; d: number }[] = [];
    const report: string[] = [];
    let allOk = true;
    for (const it of raw) {
      const assetId = String(it.assetId ?? "");
      const pos = Array.isArray(it.position) ? it.position.map(Number) : [];
      const x = Number(pos[0] ?? 0);
      const z = Number(pos[2] ?? 0);
      const [w, d] = footprintOf(assetId); // planned items -> fallback 1x1m
      if (outsideRoom(x, z, w, d)) {
        allOk = false;
        report.push(
          `✗ ${assetId} at [${x}, 0, ${z}]: outside the room bounds for its ${w}m × ${d}m footprint. Call findFreeSpace again with footprint [${w}, ${d}].`
        );
        continue;
      }
      const overlapsExisting = Object.values(useEditor.getState().doc.nodes)
        .filter((n) => n.type === "furniture")
        .some((n) => {
          const [ow, od] = footprintOf(n.assetId);
          return Math.abs(x - n.transform.position[0]) < (w + ow) / 2 && Math.abs(z - n.transform.position[2]) < (d + od) / 2;
        });
      const overlapsPlanned = planned.some(
        (o) => Math.abs(x - o.x) < (w + o.w) / 2 && Math.abs(z - o.z) < (d + o.d) / 2
      );
      if (overlapsExisting || overlapsPlanned) {
        allOk = false;
        report.push(
          `✗ ${assetId} at [${x}, 0, ${z}]: overlaps another piece. Call findFreeSpace again with footprint [${w}, ${d}].`
        );
        continue;
      }
      planned.push({ x, z, w, d });
      report.push(`✓ ${assetId} at [${x}, 0, ${z}] (ok)`);
    }
    if (allOk) return `Plan valid:\n${report.join("\n")}\nBuild it with addFurniture using these positions.`;
    return `Plan has problems — fix before building:\n${report.join("\n")}`;
  },
};

export const TOOLS: Tool[] = [inspectRoom, createRoom2d, addFurniture, undo, addWalls, drawRoom, addlights, listScene, rotateObject, moveObject, deleteObject, setMaterial, resizeObject, adjustLight, findFreeSpace, planRoom, resetRoom];
// The cable tools only exist while a Cable Ring plan is loaded.
export function activeTools(): { name: string; description: string; input_schema: Tool["input_schema"] }[] {
  return useEditor.getState().doc.cablePlan ? [...TOOLS, ...CABLE_TOOLS] : TOOLS;
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = TOOLS.find((t) => t.name === name) ?? CABLE_TOOLS.find((t) => t.name === name);
  if (!tool) {
    console.log("[runTool] UNKNOWN:", name);
    return `Unknown tool: ${name}`;
  }
  console.log("[runTool] calling:", name, "args:", JSON.stringify(args));
  try {
    const result = await tool.handler(args);
    console.log("[runTool] result:", name, "->", result);
    return typeof result === "string" ? result : `Ran ${name} successfully.`;
  } catch (err) {
    console.log("[runTool] ERROR in", name, err);
    return `Error running ${name}: ${String(err)}`;
  }
}
