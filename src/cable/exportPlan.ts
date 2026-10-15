// Saving what's on screen: the 2D plan as PNG / SVG / PDF (via the browser's
// print dialog), and the cable plan's JSON files.

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
    const { width, height } = svg.getBoundingClientRect();
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
    copy.setAttribute("width", String(width));
    copy.setAttribute("height", String(height));
    copy.setAttribute("viewBox", `0 0 ${width} ${height}`);
    copy.removeAttribute("style");
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

// The SVG drawn onto a canvas at twice screen resolution.
function svgToPng(): Promise<string | null> {
    const svg = standaloneSvg();
    if (!svg) return Promise.resolve(null);
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = svg.width * 2;
            canvas.height = svg.height * 2;
            const ctx = canvas.getContext("2d")!;
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(null);
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.text);
    });
}

export async function exportPng(name: string) {
    const url = await svgToPng();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.png`;
    a.click();
}

// PDF: the picture in a new tab with the print dialog open ("Save as PDF").
export async function exportPdf(title: string) {
    const url = await svgToPng();
    if (!url) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.title = title;
    const img = win.document.createElement("img");
    img.src = url;
    img.style.width = "100%";
    img.onload = () => win.print();
    win.document.body.style.margin = "0";
    win.document.body.appendChild(img);
}
