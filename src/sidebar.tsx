import { useState } from "react";
import { CATALOG } from "./catalog";
import type { CatalogItem } from "./catalog";
import "./catalog.css";
import { useEditor } from "./store";
import { InfoBox } from "./InfoBox";

function CatalogThumbnail({ item }: { item: CatalogItem }) {
    const [imageFailed, setImageFailed] = useState(false);

    if (item.picture && !imageFailed) {
        return <img className="catalog-card__image" src={item.picture} alt="" onError={() => setImageFailed(true)} />;
    }

    return <div className="catalog-card__placeholder">{item.kind === "furniture" ? "3D" : item.kind}</div>;
}

function SideBar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    const addNode = useEditor((state) => state.addNode);
    const dismissedTips=useEditor((s)=>s.dismissedTips)
    const showCatalogTip = !dismissedTips.includes('catalogHelp')
    const dismissTip = useEditor((state)=>state.dismissTip);
    const [query, setQuery] = useState("");
    const normalizedQuery = query.trim().toLowerCase();

    const addCatalogItem = (item: CatalogItem) => {
        const s = item.kind === "furniture" ? (item.scale ?? 1) : 1;
        if (item.kind === "wall") {
            const originX = Math.random() * 4;
            const originZ = Math.random() * 4;
            addNode({
                id: crypto.randomUUID(), name: item.label, parentId: null,
                transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
                type: "wall", start: [originX, 0, originZ], end: [originX + 2, 0, originZ],
                height: 2.7, thickness: 0.1, materialId: "wall",
            });
            return;
        }

        if (item.kind === "light") {
            addNode({
                id: crypto.randomUUID(), name: item.label, parentId: null,
                transform: { position: [Math.random() * 4, 0, Math.random() * 4], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
                type: "light", lightType: item.lightType, intensity: 20, color: "red",
            });
            return;
        }

        addNode({
            id: crypto.randomUUID(), name: item.label, parentId: null,
            transform: { position: [Math.random() * 4, 0, Math.random() * 4], rotation: [0, 0, 0, 1], scale: [s, s, s] },
            type: "furniture", assetId: item.assetId,
        });
    };


    const visibleSections = CATALOG.map((section) => {
        const items = section.items.filter((item) => {
            if (!normalizedQuery) return true;
            const base = `${section.category} ${item.label}`.toLowerCase();
            if (item.kind !== "furniture") return base.includes(normalizedQuery);
            const extra = [
                item.style, item.room, item.mood,
                ...(item.material ?? []), ...(item.tags ?? []),
                item.description,
            ].filter(Boolean).join(" ").toLowerCase();
            return `${base} ${extra}`.includes(normalizedQuery);
        });
        return { ...section, items };
    }).filter((section) => section.items.length > 0);

    return (
        <aside className={`catalog-panel ${open ? "" : "catalog-panel--collapsed"}`} aria-label="Catalog">
            <button className="catalog-panel__toggle" type="button" onClick={onToggle} aria-label={open ? "Collapse catalog" : "Expand catalog"}>
                {open ? "‹" : "›"}
            </button>
            {open && <>
                <div className="catalog-panel__header" style={{position:'relative'}}>
                    {showCatalogTip&&<InfoBox id = "catalogHelp" onDismiss={dismissTip}>Click any item below to bring it into the scene</InfoBox>}
                    <p style={{ visibility: "hidden" }} aria-hidden="true"> Down  </p>
                    <p className="catalog-panel__eyebrow">Library</p>
                    <h2>Catalog</h2>
                    
                    <input
                        className="catalog-search"
                        type="search"
                        value={query}
                        placeholder="Search furniture"
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>

                <div className="catalog-panel__content">
                    {visibleSections.map((section) => (
                        <section className="catalog-section" key={section.category}>
                            <h3>{section.category}</h3>
                            <div className="catalog-grid">
                                {section.items.map((item) => (
                                    <button className="catalog-card" key={item.label} type="button" onClick={() => addCatalogItem(item)}>
                                    <CatalogThumbnail item={item} />
                                    <span className="catalog-card__name">{item.label}</span>
                                    {item.kind === "furniture" && item.style && (
                                        <span className="catalog-card__style">{item.style}</span>
                                    )}
                                    {item.kind === "furniture" && item.tags && item.tags.length > 0 && (
                                        <span className="catalog-card__tags">{item.tags.join(", ")}</span>
                                    )}
                                    <span className="catalog-card__action">Add to scene</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                    {visibleSections.length === 0 && <p className="catalog-empty">No catalog items match “{query}”.</p>}
                </div>
            </>}
        </aside>
    );
}

export default SideBar;
