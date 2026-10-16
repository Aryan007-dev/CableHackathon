
import "./ToolSideBar.css";

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
    const navigationTools = [
        { id: "select" as const, label: "Select", shortcut: "V" },
        { id: "pan" as const, label: "Pan", shortcut: "H" },
    ];

    return (
        <aside className="tool-sidebar" aria-label="Floor plan tools">
            <div className="tool-sidebar__navigation">
                {navigationTools.map((tool) => {
                    const selected = activeTool === tool.id;

                    return (
                        <button
                            key={tool.id}
                            type="button"
                            className="tool-sidebar__mode"
                            data-active={selected}
                            aria-pressed={selected}
                            onClick={() => onToolChange(tool.id)}
                        >
                            <span>{tool.label}</span>
                            <kbd>{tool.shortcut}</kbd>
                        </button>
                    );
                })}
            </div>

            <div className="tool-sidebar__sections">
                {sections.map((section) => (
                    <section
                        className="tool-sidebar__section"
                        key={section.title}
                    >
                        <h3 className="tool-sidebar__heading">
                            <span className="tool-sidebar__number">
                                {section.number}
                            </span>
                            <span>{section.title}</span>
                        </h3>

                        <div className="tool-sidebar__items">
                            {section.tools.map((tool) => {
                                const selected =
                                    activeTool === tool.id ||
                                    (tool.id === "furniture" && libraryOpen);

                                return (
                                    <button
                                        key={tool.id}
                                        type="button"
                                        className="tool-sidebar__item"
                                        data-active={selected}
                                        aria-pressed={selected}
                                        onClick={() => onToolChange(tool.id)}
                                    >
                                        <span className="tool-sidebar__label">
                                            {tool.label}
                                        </span>
                                        <kbd>{tool.shortcut}</kbd>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </aside>
    );
}
