// The background grid. The patterns tile in the drawing group's coordinates,
// so the grid pans and zooms with the plan.
export default function GridLayer({ minor, major }: { minor: number; major: number }) {
    return (
        <>
            <defs>
                <pattern id="grid-small" width={minor} height={minor} patternUnits="userSpaceOnUse">
                    <path d={`M ${minor} 0 L 0 0 0 ${minor}`} fill="none" stroke="var(--color-grid-minor)" strokeWidth={1} />
                </pattern>

                <pattern id="grid-large" width={major} height={major} patternUnits="userSpaceOnUse">
                    <rect width={major} height={major} fill="url(#grid-small)" />
                    <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke="var(--color-grid-major)" strokeWidth={1.5} />
                </pattern>
            </defs>

            <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid-large)" />
        </>
    );
}
