export type Tool =
    | "select"
    | "pan"
    | "wall"
    | "rectangle"
    | "polygon"
    | "door"
    | "window"
    | "measure"
    | "furniture";

type ToolSideBarProps = {
    activeTool: Tool;
    onToolChange: (tool: Tool) => void;
    // The furniture library is a panel, not a tool: highlight it while it's open.
    libraryOpen?: boolean;
};

const sections = [
    {
        number: 1,
        title: "DRAW ROOMS",
        tools: [
            { id: "wall", label: "Wall", shortcut: "W" },
            { id: "rectangle", label: "Rectangle room", shortcut: "R" },
            { id: "polygon", label: "Any shape (polygon)", shortcut: "G" },
        ],
    },
    {
        number: 2,
        title: "DOORS & WINDOWS",
        tools: [
            { id: "door", label: "Door", shortcut: "D" },
            { id: "window", label: "Window", shortcut: "N" },
        ],
    },
    {
        number: 3,
        title: "FURNISH",
        tools: [
            { id: "furniture", label: "Furniture library", shortcut: "L" },
        ],
    },
    {
        number: 4,
        title: "MEASURE & LABEL",
        tools: [
            { id: "measure", label: "Measure", shortcut: "M" },
        ],
    },
] as const;

export default function ToolSideBar({
    activeTool,
    onToolChange,
    libraryOpen = false,
}: ToolSideBarProps) {
    return (
        <aside
            style={{
                width: 280,
                height: "100%",
                padding: 16,
                background: "var(--color-surface)",
                borderRight: "1px solid var(--color-border)",
                color: "var(--color-ink)",
                boxSizing: "border-box",
            }}
        >
            {/* Navigation tools */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <button
                    onClick={() => onToolChange("select")}
                    style={{
                        flex: 1,
                        padding: 10,
                        background:
                            activeTool === "select" ? "var(--color-accent)" : "var(--color-surface)",
                        color:
                            activeTool === "select" ? "var(--color-accent-contrast)" : "var(--color-ink)",
                        border: "1px solid var(--color-border-strong)",
                        borderRadius: 8,
                    }}
                >
                    Select <kbd>V</kbd>
                </button>

                <button
                    onClick={() => onToolChange("pan")}
                    style={{
                        flex: 1,
                        padding: 10,
                        background:
                            activeTool === "pan" ? "var(--color-accent)" : "var(--color-surface)",
                        color:
                            activeTool === "pan" ? "var(--color-accent-contrast)" : "var(--color-ink)",
                        border: "1px solid var(--color-border-strong)",
                        borderRadius: 8,
                    }}
                >
                    Pan <kbd>H</kbd>
                </button>
            </div>

            {/* Tool sections */}
            {sections.map((section) => (
                <section key={section.title} style={{ marginBottom: 24 }}>
                    <h3
                        style={{
                            margin: "0 0 8px",
                            fontSize: 13,
                            color: "var(--color-ink-muted)",
                            letterSpacing: 0.5,
                        }}
                    >
                        {section.number} {section.title}
                    </h3>

                    {section.tools.map((tool) => {
                        const selected = activeTool === tool.id || (tool.id === "furniture" && libraryOpen);

                        return (
                            <button
                                key={tool.id}
                                onClick={() => onToolChange(tool.id)}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    width: "100%",
                                    padding: "12px 10px",
                                    marginBottom: 4,
                                    border: "none",
                                    borderRadius: 8,
                                    background: selected
                                        ? "var(--color-accent)"
                                        : "transparent",
                                    color: selected
                                        ? "var(--color-accent-contrast)"
                                        : "var(--color-ink)",
                                    textAlign: "left",
                                    cursor: "pointer",
                                }}
                            >
                                <span>{tool.label}</span>
                                <kbd>{tool.shortcut}</kbd>
                            </button>
                        );
                    })}
                </section>
            ))}
        </aside>
    );
}
