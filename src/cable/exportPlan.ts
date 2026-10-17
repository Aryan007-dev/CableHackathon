// Saving what's on screen: the 2D plan as PNG / SVG / PDF (via the browser's
// print dialog), and the cable plan's JSON files.
import { useEditor } from "../store";
import type { SceneDocument } from "../store";
import { PX_PER_METER, formatLength } from "../units";
import { SYMBOL_BY_ID } from "../2d/symbolLibrary";
import { combineElectricalSchedules, createPlanDataset, exportOrientation, getElectricalSchedule, scaleBarMeters } from "../2d/electricalPlan";
import { solutionView, solverDeviceDetails, solverDeviceTypeLabel } from "./cablePlan";
import type { SolutionId } from "./cablePlan";

// The 2D plan's <svg> (FloorPlan marks it).
const planSvg = () => document.querySelector<SVGSVGElement>("svg[data-plan-svg]");

export function download(name: string, data: Blob | string, type = "application/json") {
    const blob = typeof data === "string" ? new Blob([data], { type }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadJson = (name: string, value: unknown) => download(name, JSON.stringify(value, null, 1));

// A standalone copy of the plan's SVG. Its colours are CSS variables from
// theme.css, which a saved file can't see, so each one is replaced by the
// colour the browser actually used.
function standaloneSvg(): { text: string; width: number; height: number } | null {
    const svg = planSvg();
    if (!svg) return null;
    const { width: viewportWidth, height: viewportHeight } = svg.getBoundingClientRect();
    const copy = svg.cloneNode(true) as SVGSVGElement;
    const originals = [svg, ...svg.querySelectorAll("*")];
    const copies = [copy, ...copy.querySelectorAll("*")];
    originals.forEach((el, i) => {
        const style = getComputedStyle(el);
        for (const attr of ["fill", "stroke"]) {
            if (el.getAttribute(attr)?.includes("var(")) copies[i].setAttribute(attr, style.getPropertyValue(attr));
        }
    });
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.removeAttribute("style");
    copy.querySelectorAll("[data-export-ignore]").forEach((el) => el.remove());
    // Export the whole drawing at its native plan scale instead of a cropped
    // screen viewport. The screen grid is not part of the printable plan.
    const drawing = copy.querySelector<SVGGElement>(":scope > g[transform]");
    let width = viewportWidth;
    let height = viewportHeight;
    if (drawing) {
        drawing.removeAttribute("transform");
        // GridLayer is nested inside this transformed group (not on the root).
        // Its 10,000 × 10,000 rect was the source of the huge blank exports.
        drawing.querySelector(':scope > rect[fill="url(#grid-large)"]')?.remove();
        const gridDefs = drawing.querySelector(":scope > defs");
        if (gridDefs?.querySelector("#grid-small, #grid-large")) gridDefs.remove();
        copy.setAttribute("width", String(viewportWidth));
        copy.setAttribute("height", String(viewportHeight));
        copy.style.cssText = `position:fixed;left:-100000px;top:0;width:${viewportWidth}px;height:${viewportHeight}px;visibility:hidden;pointer-events:none`;
        document.body.appendChild(copy);
        const bounds = drawing.getBBox();
        if (bounds.width > 0 && bounds.height > 0) {
            const padding = 48;
            drawing.setAttribute("transform", `translate(${padding - bounds.x} ${padding - bounds.y})`);
            width = bounds.width + padding * 2;
            height = bounds.height + padding * 2;
        }
        copy.remove();
        copy.removeAttribute("style");
    }
    copy.setAttribute("width", String(width));
    copy.setAttribute("height", String(height));
    copy.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const background = getComputedStyle(document.documentElement).getPropertyValue("--color-canvas").trim() || "#ffffff";
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    copy.insertBefore(bg, copy.firstChild);
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", background);
    return { text: new XMLSerializer().serializeToString(copy), width, height };
}

export function exportSvg(name: string) {
    const svg = standaloneSvg();
    if (svg) download(`${name}.svg`, svg.text, "image/svg+xml");
}

type ExportMaterial = { label: string; quantity: number };

function solverSchedule(plan: SceneDocument["cablePlan"]): ReturnType<typeof getElectricalSchedule> {
    const counts = new Map<string, number>();
    const devices = solverDeviceDetails(plan);
    devices.forEach((device) => {
        const label = solverDeviceTypeLabel(device.roomKind);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return { total: devices.length, byType: [...counts].map(([label, count]) => ({ label, count })) };
}

function exportMaterials(doc: SceneDocument, solverPlan = doc.cablePlan): ExportMaterial[] {
    const counts = new Map<string, number>();
    doc.planFurniture.forEach((item) => {
        const symbol = SYMBOL_BY_ID[item.symbolId];
        if (symbol?.category === "Electrical") counts.set(symbol.label, (counts.get(symbol.label) ?? 0) + 1);
    });
    const materials = [...counts].map(([label, quantity]) => ({ label, quantity }));
    const solverDevices = solverDeviceDetails(solverPlan);
    const deviceSchedule = solverSchedule(solverPlan);
    const panelCounts = new Map<string, number>();
    solverDevices.forEach((device) => {
        if (device.hubId) panelCounts.set(device.hubId, (panelCounts.get(device.hubId) ?? 0) + 1);
    });
    materials.push(...deviceSchedule.byType.map(({ label, count }) => ({ label, quantity: count })));
    materials.push(...[...panelCounts].map(([hubId, quantity]) => ({ label: `${hubId} assigned devices`, quantity })));
    const doors = doc.openings.filter((opening) => opening.kind === "door").length;
    const windows = doc.openings.filter((opening) => opening.kind === "window").length;
    if (doors) materials.push({ label: "Door openings", quantity: doors });
    if (windows) materials.push({ label: "Window openings", quantity: windows });
    const wallLength = doc.planWalls.reduce((total, wall) => total + Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) / PX_PER_METER, 0);
    if (wallLength > 0) materials.push({ label: "Measured wall run", quantity: Math.round(wallLength * 100) / 100 });
    return materials;
}

// A printable report canvas: the current dimensioned plan, a true scale bar,
// and a quantity takeoff based on the placed electrical symbols.
async function createReportCanvas(
    title: string,
    doc: SceneDocument,
    units: "m" | "ft",
    svg = standaloneSvg(),
    solverPlan = doc.cablePlan
): Promise<HTMLCanvasElement | null> {
    if (!svg) return null;
    const planImage = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.text);
    });
    if (!planImage) return null;

    const width = 1800;
    const margin = 56;
    const portrait = exportOrientation(svg.width, svg.height) === "portrait";
    const planBoxWidth = width - margin * 2;
    const planBoxHeight = portrait ? 1440 : 920;
    const planScale = Math.min(planBoxWidth / planImage.width, planBoxHeight / planImage.height);
    const planWidth = planImage.width * planScale;
    const planHeight = planImage.height * planScale;
    const planX = (width - planWidth) / 2;
    const planY = 146;
    const materials = exportMaterials(doc, solverPlan);
    const electricalTotal = combineElectricalSchedules(
        getElectricalSchedule(doc.planFurniture), solverSchedule(solverPlan)
    ).total;
    const rows = Math.max(1, Math.ceil(materials.length / 2));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = planY + planHeight + 100 + rows * 34 + 75;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#18332f";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.fillText(title || "Electrical floor plan", margin, 56);
    ctx.fillStyle = "#62716d";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Dimensioned floor plan · electrical device schedule · quantities for estimating", margin, 88);
    ctx.drawImage(planImage, planX, planY, planWidth, planHeight);

    // The bar is drawn over the plan; its printed length is converted back to
    // model units using the current editor zoom and the image fit factor.
    const barPx = 150;
    const meters = scaleBarMeters(barPx, planScale);
    const barX = planX + planWidth - barPx - 26;
    const barY = planY + planHeight - 34;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillRect(barX - 12, barY - 38, barPx + 24, 58);
    ctx.strokeStyle = "#18332f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + barPx, barY);
    ctx.moveTo(barX, barY - 7);
    ctx.lineTo(barX, barY + 7);
    ctx.moveTo(barX + barPx, barY - 7);
    ctx.lineTo(barX + barPx, barY + 7);
    ctx.stroke();
    ctx.fillStyle = "#18332f";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(formatLength(meters, units), barX + barPx / 2, barY - 12);
    ctx.textAlign = "left";

    const scheduleY = planY + planHeight + 48;
    ctx.strokeStyle = "#d8e0dc";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, scheduleY - 18);
    ctx.lineTo(width - margin, scheduleY - 18);
    ctx.stroke();
    ctx.fillStyle = "#18332f";
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText(`Materials & devices (${electricalTotal} electrical devices)`, margin, scheduleY);
    ctx.font = "15px system-ui, sans-serif";
    materials.forEach((item, i) => {
        const col = Math.floor(i / rows);
        const row = i % rows;
        const x = margin + col * (planBoxWidth / 2);
        const y = scheduleY + 32 + row * 34;
        ctx.fillStyle = "#62716d";
        ctx.fillText(item.label, x, y);
        ctx.fillStyle = "#18332f";
        ctx.font = "700 15px system-ui, sans-serif";
        ctx.fillText(typeof item.quantity === "number" ? String(item.quantity) : "", x + planBoxWidth / 2 - 30, y);
        ctx.font = "15px system-ui, sans-serif";
    });
    ctx.fillStyle = "#788680";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Preliminary quantities only. Verify device locations, routing, ratings, and local requirements on site.", margin, canvas.height - 25);
    return canvas;
}

export async function exportPng(name: string) {
    const { doc, units, cableLayers } = useEditor.getState();
    const solverPlan = doc.cablePlan ? solutionView(doc.cablePlan, cableLayers.solution) : null;
    const svg = standaloneSvg();
    const canvas = await createReportCanvas(name, doc, units, svg, solverPlan);
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${name}.png`;
    a.click();
}

// PDF: the picture in a new tab with the print dialog open ("Save as PDF").
export async function exportPdf(title: string) {
    const { doc, units, cableLayers } = useEditor.getState();
    const solverPlan = doc.cablePlan ? solutionView(doc.cablePlan, cableLayers.solution) : null;
    const svg = standaloneSvg();
    const canvas = await createReportCanvas(title, doc, units, svg, solverPlan);
    if (!canvas) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.title = title;
    const orientation = svg ? exportOrientation(svg.width, svg.height) : "landscape";
    const maxHeight = orientation === "portrait" ? "260mm" : "185mm";
    win.document.head.innerHTML = `<meta charset="utf-8"><style>@page{size:A4 ${orientation};margin:10mm}*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;color:#18332f}img{display:block;width:100%;height:auto;max-height:${maxHeight};object-fit:contain}@media print{img{max-height:${maxHeight}}}</style>`;
    const img = win.document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    img.onload = () => win.print();
    win.document.body.appendChild(img);
}

export async function exportDataset(title: string) {
    const { doc, units, cableLayers } = useEditor.getState();
    const solutionId = cableLayers.solution as SolutionId;
    const solverPlan = doc.cablePlan ? solutionView(doc.cablePlan, solutionId) : null;
    const svg = standaloneSvg();
    const canvas = await createReportCanvas(title, doc, units, svg, solverPlan);
    if (!canvas) return;
    const manualSchedule = getElectricalSchedule(doc.planFurniture);
    const devices = solverDeviceDetails(solverPlan);
    const electricalSchedule = combineElectricalSchedules(manualSchedule, solverSchedule(solverPlan));
    const bundle = createPlanDataset(doc, title, canvas.toDataURL("image/png"), new Date().toISOString(), units, {
        solutionId,
        electricalSchedule,
        solverDevices: devices.map(({ node_id, room_id, roomKind, hubId, sequenceNumber, x, y }) => ({
            node_id, room_id, roomKind, hubId, sequenceNumber, x, y,
        })),
    });
    download(`${title || "gridmind-plan"}-dataset.json`, JSON.stringify(bundle, null, 2));
}
