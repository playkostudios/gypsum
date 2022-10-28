export type CSGPrimitive = {
    primitive: 'cube',
    size?: Vec3 | number,
    center?: boolean,
} | {
    primitive: 'cylinder',
    height: number,
    radiusLow: number,
    radiusHigh?: number,
    circularSegments?: number,
    center?: boolean,
} | {
    primitive: 'sphere',
    radius: number,
    circularSegments?: number,
} | {
    primitive: 'tetrahedron',
};