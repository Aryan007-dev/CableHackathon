export type XY = [number, number];

export interface FeaturePlan {
    hubs: { hub_id: string; ring: XY[] }[];
    problems?: { crossings: XY[]; overlaps: XY[][] };
}

export type CableFeatureKind = "bends" | "crossings" | "overlaps";

export interface HubFeatures {
    bends: XY[];
    bendSpans: XY[][];
    crossings: XY[];
    overlaps: XY[][];
}

const DUPLICATE_TOLERANCE = 0.001; // Same 1 mm tolerance as the solver's bend count.
const PATH_TOLERANCE = 0.025; // Allow for rounded solver coordinates in problem geometry.

const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function cleanRing(points: XY[]): XY[] {
    const clean: XY[] = [];
    for (const point of points) {
        if (!clean.length || distance(point, clean[clean.length - 1]) > DUPLICATE_TOLERANCE) clean.push(point);
    }
    if (clean.length > 1 && distance(clean[0], clean[clean.length - 1]) <= DUPLICATE_TOLERANCE) clean.pop();
    return clean;
}

// The scorer counts changes of direction around the closed ring, including a
// turn at its hub. This returns those same vertices for the 3D markers.
export function bendsOfRing(points: XY[]): XY[] {
    const ring = cleanRing(points);
    if (ring.length < 2) return [];
    const direction = (a: XY, b: XY) => [Math.sign(Math.round((b[0] - a[0]) * 1e9)), Math.sign(Math.round((b[1] - a[1]) * 1e9))];
    return ring.filter((point, index) => {
        const previous = direction(ring[(index - 1 + ring.length) % ring.length], point);
        const next = direction(point, ring[(index + 1) % ring.length]);
        return previous[0] !== next[0] || previous[1] !== next[1];
    });
}

// Short sections on either side of each turn, for coloring the cable itself.
export function bendSpansOfRing(points: XY[]): XY[][] {
    const ring = cleanRing(points);
    if (ring.length < 2) return [];
    const bends = bendsOfRing(points);
    return bends.map((point) => {
        const index = ring.indexOf(point);
        const previous = ring[(index - 1 + ring.length) % ring.length];
        const next = ring[(index + 1) % ring.length];
        const toward = (neighbor: XY): XY => {
            const length = distance(point, neighbor);
            const arm = Math.min(0.22, length * 0.45);
            return [point[0] + (neighbor[0] - point[0]) * arm / length,
                point[1] + (neighbor[1] - point[1]) * arm / length];
        };
        return [toward(previous), point, toward(next)];
    });
}

function nearSegment(point: XY, a: XY, b: XY): boolean {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1e-10) return distance(point, a) <= PATH_TOLERANCE;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
    return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy)) <= PATH_TOLERANCE;
}

function onRing(point: XY, ring: XY[]): boolean {
    for (let index = 1; index < ring.length; index++) {
        if (nearSegment(point, ring[index - 1], ring[index])) return true;
    }
    return false;
}

function spanOnRing(span: XY[], ring: XY[]): boolean {
    for (let index = 1; index < span.length; index++) {
        const a = span[index - 1];
        const b = span[index];
        const midpoint: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (onRing(midpoint, ring)) return true;
    }
    return false;
}

export function featuresByHub(plan: FeaturePlan): Record<string, HubFeatures> {
    const crossings = plan.problems?.crossings ?? [];
    const overlaps = plan.problems?.overlaps ?? [];
    return Object.fromEntries(plan.hubs.map((hub) => [hub.hub_id, {
        bends: bendsOfRing(hub.ring),
        bendSpans: bendSpansOfRing(hub.ring),
        crossings: crossings.filter((point) => onRing(point, hub.ring)),
        overlaps: overlaps.filter((span) => spanOnRing(span, hub.ring)),
    }]));
}
