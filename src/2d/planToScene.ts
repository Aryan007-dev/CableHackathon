// Turns one 2D furniture symbol from the plan into the 3D node that stands for
// it: a real catalog model when one matches the symbol, otherwise a plain box.
//
// Pure: it reads only its argument plus the catalog and symbol tables, and
// returns a new node. It never touches the store, so it can be tested in plain
// Node with no browser.
import type { PlanFurniture, SceneNode } from "../store";

import { SYMBOL_BY_ID } from "./symbolLibrary";
import { FURNITURE_BY_ID } from "../catalog";
import { planRotationToQuat } from "./planGeometry";
import { PX_PER_METER } from "../units";

export function planToScene(piece: PlanFurniture): SceneNode {
    const symbol = SYMBOL_BY_ID[piece.symbolId];

    // A model can stand in for this symbol when its pieceType is one the symbol
    // accepts. A symbol with no pieceTypes at all (a dining set: table + chairs,
    // which no single model can be) always stays a placeholder.
    const model = Object.values(FURNITURE_BY_ID).find(
        (m) => m.pieceType && symbol?.pieceTypes?.includes(m.pieceType)
    );

    // Reuse the 2D piece's id for the 3D node. Two things fall out of this: the
    // function has no randomness (so it's testable), and a rebuild can match a
    // 2D piece to its 3D node just by id.
    const id = piece.id;
    const name = symbol?.label ?? "Furniture";

    // Plan pixels -> metres. The plan's y runs down the screen, which is 3D's z;
    // 3D's y is height, and 0 means "sitting on the floor".
    const x = piece.x / PX_PER_METER;
    const z = piece.y / PX_PER_METER;

    if (!model) {
        return {
            id,
            name,
            parentId: null,
            transform: {
                position: [x, 0, z],
                rotation: planRotationToQuat(piece.rotation),
                scale: [1, 1, 1],
            },
            type: "placeholder",
            width: symbol?.width ?? piece.width,
            depth: symbol?.depth ?? piece.depth,
            height: symbol?.height ?? 1,
            fromPlan: true,
        };
    }

    // Most models face +z, but some don't; yawOffset (radians) is the extra turn
    // that corrects one. planRotationToQuat takes degrees and turns the opposite
    // way, so convert and subtract to fold the correction into the piece's angle.
    const degrees = piece.rotation - ((model.yawOffset ?? 0) * 180) / Math.PI;

    // A GLB's origin isn't always the middle of its footprint. centerOffset says
    // where that middle sits relative to the origin, so to land the middle on the
    // 2D piece's centre we subtract the offset - turned by the piece's own angle,
    // since the model rotates with it.
    const [cx, cz] = model.centerOffset ?? [0, 0];
    const psi = (-degrees * Math.PI) / 180;
    const cos = Math.cos(psi);
    const sin = Math.sin(psi);
    const offsetX = cx * cos + cz * sin;
    const offsetZ = -cx * sin + cz * cos;

    // Catalog models are authored at arbitrary sizes; `scale` normalises them to
    // real-world metres. Same convention the catalog sidebar uses when spawning.
    const s = model.scale ?? 1;

    return {
        id,
        name,
        parentId: null,
        transform: {
            position: [x - offsetX, 0, z - offsetZ],
            rotation: planRotationToQuat(degrees),
            scale: [s, s, s],
        },
        type: "furniture",
        assetId: model.assetId,
        footprint: model.footprint,
        fromPlan: true,
    };
}
