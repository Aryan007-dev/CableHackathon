export const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE ?? "").replace(/\/$/, "");
export const asset = (path: string) => `${ASSET_BASE}${path}`;