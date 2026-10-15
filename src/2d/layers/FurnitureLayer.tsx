import type { PlanFurniture } from "../../store";
import { PX_PER_METER } from "../../units";
import SymbolRenderer from "../SymbolRenderer";
import type { Point } from "../planGeometry";
import { SYMBOL_BY_ID } from "../symbolLibrary";

type FurnitureLayerProps = {
    furniture: PlanFurniture[];
    // A piece picked from the library, following the cursor until it's placed.
    pending: { symbolId: string; rotation: number; at: Point } | null;
};

// Each piece is moved to its centre and turned, then its symbol is drawn
// around 0,0 at its real size.
export default function FurnitureLayer({ furniture, pending }: FurnitureLayerProps) {
    const pendingSymbol = pending && SYMBOL_BY_ID[pending.symbolId];

    return (
        <>
            {furniture.map((f) => {
                const symbol = SYMBOL_BY_ID[f.symbolId];
                return symbol && (
                    <g key={f.id} transform={`translate(${f.x} ${f.y}) rotate(${f.rotation})`}>
                        <SymbolRenderer symbol={symbol} w={f.width * PX_PER_METER} d={f.depth * PX_PER_METER} />
                    </g>
                );
            })}

            {pending && pendingSymbol && (
                <g
                    transform={`translate(${pending.at[0]} ${pending.at[1]}) rotate(${pending.rotation})`}
                    opacity={0.6}
                    pointerEvents="none"
                >
                    <SymbolRenderer
                        symbol={pendingSymbol}
                        w={pendingSymbol.width * PX_PER_METER}
                        d={pendingSymbol.depth * PX_PER_METER}
                    />
                </g>
            )}
        </>
    );
}
