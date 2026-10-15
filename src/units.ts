// The 2D floor plan draws in SVG pixels; the 3D scene works in metres.
// One small grid cell (20px) is one foot, so every px <-> m conversion must
// go through these constants or the 2D labels and 3D walls disagree.
export const M_PER_FOOT = 0.3048;
export const PX_PER_FOOT = 20;
export const PX_PER_METER = PX_PER_FOOT / M_PER_FOOT;

// Display unit only — the document always stores metres.
export type LengthUnit = "m" | "ft";

const M_PER_INCH = M_PER_FOOT / 12;

// 3.048 -> "3.05 m" or "10' 0""
export function formatLength(meters: number, unit: LengthUnit): string {
    if (unit === "m") return `${meters.toFixed(2)} m`;
    const totalInches = Math.round(meters / M_PER_INCH);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}' ${inches}"`;
}

// 9.29 -> "9.29 m²" or "100.00 ft²"
export function formatArea(squareMeters: number, unit: LengthUnit): string {
    if (unit === "m") return `${squareMeters.toFixed(2)} m²`;
    return `${(squareMeters / (M_PER_FOOT * M_PER_FOOT)).toFixed(2)} ft²`;
}
