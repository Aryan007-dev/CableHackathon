
import "./ToolSideBar.css";
import { Download, FileText } from "lucide-react";
import { useEditor } from "../store";
import { exportDataset, exportPdf, exportPng } from "../cable/exportPlan";
import { getElectricalSchedule } from "./electricalPlan";
import { solutionView, solverDeviceDetails, solverDeviceTypeLabel } from "../cable/cablePlan";

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
    const planFurniture = useEditor((s) => s.doc.planFurniture);
    const cablePlan = useEditor((s) => s.doc.cablePlan);
    const cableSolution = useEditor((s) => s.cableLayers.solution);
    const planReady = useEditor((s) => s.doc.cablePlan != null || s.doc.planWalls.length > 0 || s.doc.floorPlan.length > 1);
    const projectName = useEditor((s) => s.currentProjectName ?? "GridMind electrical plan");
    const electricalSchedule = getElectricalSchedule(planFurniture);
    const { total: electricalTotal, byType: electricalCounts } = electricalSchedule;
    const solverPlan = cablePlan ? solutionView(cablePlan, cableSolution) : null;
    const generatedDevices = solverDeviceDetails(solverPlan);
    const generatedTypes = new Map<string, number>();
    const generatedPanels = new Map<string, number>();
    generatedDevices.forEach((device) => {
        const label = solverDeviceTypeLabel(device.roomKind);
        generatedTypes.set(label, (generatedTypes.get(label) ?? 0) + 1);
        if (device.hubId) generatedPanels.set(device.hubId, (generatedPanels.get(device.hubId) ?? 0) + 1);
    });
    const totalDevices = electricalTotal + generatedDevices.length;
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

            <section className="tool-sidebar__schedule" aria-label="Electrical device schedule">
                <div className="tool-sidebar__schedule-title">
                    <strong>Electrical schedule</strong>
                    <span>{totalDevices} total</span>
                </div>
                {totalDevices === 0 ? (
                    <p>No generated devices or manual electrical placements.</p>
                ) : (
                    <>
                        <ul>
                            {[...generatedTypes].map(([label, count]) => (
                                <li key={label}><span>{label}</span><strong>{count}</strong></li>
                            ))}
                            {electricalCounts.map(({ label, count }) => (
                                <li key={label}><span>{label}</span><strong>{count}</strong></li>
                            ))}
                        </ul>
                        {generatedPanels.size > 0 && <div className="tool-sidebar__panel-counts" aria-label="Devices assigned per panel">
                            {[...generatedPanels].map(([hubId, count]) => <span key={hubId}>{hubId}: {count} device{count === 1 ? "" : "s"}</span>)}
                        </div>}
                    </>
                )}
            </section>
            <div className="tool-sidebar__exports" aria-label="Plan exports">
                <button type="button" disabled={!planReady} onClick={() => void exportPng(projectName)}>
                    <Download size={15} /> Export PNG
                </button>
                <button type="button" disabled={!planReady} onClick={() => void exportPdf(projectName)}>
                    <FileText size={15} /> Export PDF
                </button>
                <button type="button" disabled={!planReady} onClick={() => void exportDataset(projectName)}>
                    <Download size={15} /> Dataset JSON
                </button>
            </div>
        </aside>
    );
}
