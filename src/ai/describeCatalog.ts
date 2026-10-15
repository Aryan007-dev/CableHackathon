import { CATALOG } from "../catalog";
import type { FurnitureItem } from "../catalog";


export function DescribeCatalog(): string {
    const lines = CATALOG.map((section) => {
        const itemText = section.items.filter((item): item is FurnitureItem => item.kind === "furniture")
            .map((item) => {
                const back = item.faces ?? "south";
                const material = (item.material ?? []).join("/");
                const palette = (item.palette ?? []).join("/");
                const tags = (item.tags ?? []).join(",");
                const style = item.style ?? "n/a";
                const room = item.room ?? "n/a";
                const mood = item.mood ?? "n/a";
                const seats = item.seats ?? "n/a";
                const description = item.description ?? "";
                return `${item.label} (${item.assetId}) — style:${style}, room:${room}, material:${material}, palette:${palette}, mood:${mood}, seats:${seats}, tags:${tags}, ${description} [back faces ${back}]`;
            })
            .join(", ")
        return `${section.category}: ${itemText}`;
    })
    return lines.join("\n")



}