import ArchitecturalSymbol from "./ArchitecturalSymbol";
import type { ArchitecturalShape } from "./ArchitecturalSymbol";
import FixtureSymbol from "./FixtureSymbol";
import type { FixtureShape } from "./FixtureSymbol";
import FurnitureSymbol from "./FurnitureSymbol";
import ElectricalSymbol from "./ElectricalSymbol";
import type { FurnitureSymbolDef } from "./symbolLibrary";

type SymbolRendererProps = {
  symbol: FurnitureSymbolDef;
  w: number;
  d: number;
};

/** Renders any entry from the shared 2D symbol library. */
export default function SymbolRenderer({ symbol, w, d }: SymbolRendererProps) {
  if (symbol.renderer === "architectural") {
    return <ArchitecturalSymbol shape={symbol.shape as ArchitecturalShape} w={w} d={d} />;
  }

  if (symbol.renderer === "fixture") {
    return <FixtureSymbol shape={symbol.shape as FixtureShape} w={w} d={d} />;
  }

  if (symbol.renderer === "electrical") {
    return <ElectricalSymbol shape={symbol.shape as "outlet" | "switch" | "ceilingLight" | "smokeAlarm" | "panel" | "dedicatedCircuit"} w={w} d={d} />;
  }

  return <FurnitureSymbol shape={symbol.shape} w={w} d={d} />;
}
