import { useState } from "react";

import SymbolRenderer from "./SymbolRenderer";
import { FURNITURE_CATEGORIES, FURNITURE_SYMBOLS } from "./symbolLibrary";
import { formatLength } from "../units";
import type { LengthUnit } from "../units";

type FurnitureLibraryPanelProps = {
    units: LengthUnit;
    // The piece currently being placed, highlighted in the grid.
    activeSymbolId: string | null;
    onPick: (symbolId: string) => void;
    onClose: () => void;
};

const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-strong)"}`,
    background: active ? "var(--color-accent)" : "var(--color-surface)",
    color: active ? "var(--color-accent-contrast)" : "var(--color-ink)",
    fontSize: 12,
    cursor: "pointer",
});

export default function FurnitureLibraryPanel({ units, activeSymbolId, onPick, onClose }: FurnitureLibraryPanelProps) {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<string>("All");

    const normalizedQuery = query.trim().toLowerCase();
    const visible = FURNITURE_SYMBOLS.filter(
        (symbol) =>
            (category === "All" || symbol.category === category) &&
            (!normalizedQuery || `${symbol.label} ${symbol.category}`.toLowerCase().includes(normalizedQuery))
    );

    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: 300,
                zIndex: 1100,
                display: "flex",
                flexDirection: "column",
                background: "var(--color-surface)",
                borderRight: "1px solid var(--color-border)",
                boxShadow: "4px 0 12px rgba(31, 42, 36, 0.08)",
                color: "var(--color-ink)",
            }}
        >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", padding: "14px 16px 8px" }}>
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Symbol Library</h3>
                    <div style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                        {FURNITURE_SYMBOLS.length} symbols · real sizes
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close furniture library"
                    style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "var(--color-ink-muted)" }}
                >
                    ×
                </button>
            </div>

            {/* Search + categories */}
            <div style={{ padding: "0 16px 10px" }}>
                <input
                    type="search"
                    value={query}
                    placeholder="Search symbols…"
                    onChange={(e) => setQuery(e.target.value)}
                    style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "8px 10px",
                        border: "1px solid var(--color-border-strong)",
                        background: "var(--color-canvas)",
                        color: "var(--color-ink)",
                        borderRadius: 8,
                        fontSize: 13,
                    }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {["All", ...FURNITURE_CATEGORIES].map((name) => (
                        <button key={name} type="button" onClick={() => setCategory(name)} style={chipStyle(category === name)}>
                            {name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Cards */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "4px 16px 12px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    alignContent: "start",
                }}
            >
                {visible.map((symbol) => {
                    // Thumbnail in centimetres, framed with a little margin around the larger side.
                    const size = Math.max(symbol.width, symbol.depth) * 100;
                    const active = symbol.id === activeSymbolId;
                    return (
                        <button
                            key={symbol.id}
                            type="button"
                            onClick={() => onPick(symbol.id)}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 4,
                                padding: 8,
                                border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                                background: active ? "var(--color-accent-soft)" : "var(--color-surface)",
                                borderRadius: 10,
                                cursor: "pointer",
                                color: "var(--color-ink)",
                            }}
                        >
                            <svg
                                viewBox={`${-size * 0.6} ${-size * 0.6} ${size * 1.2} ${size * 1.2}`}
                                width="100%"
                                height={72}
                            >
                                <SymbolRenderer symbol={symbol} w={symbol.width * 100} d={symbol.depth * 100} />
                            </svg>
                            <span style={{ fontSize: 12, fontWeight: 600, textAlign: "center" }}>{symbol.label}</span>
                            <span style={{ fontSize: 11, color: "var(--color-ink-muted)", fontFamily: "monospace" }}>
                                {formatLength(symbol.width, units)} × {formatLength(symbol.depth, units)}
                            </span>
                        </button>
                    );
                })}
                {visible.length === 0 && (
                    <p style={{ gridColumn: "1 / -1", fontSize: 13, color: "var(--color-ink-muted)" }}>No symbols match “{query}”.</p>
                )}
            </div>

            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-ink-muted)" }}>
                Click a symbol, then click on the plan to place it. <kbd>E</kbd> rotates · <kbd>Esc</kbd> cancels
            </div>
        </div>
    );
}
