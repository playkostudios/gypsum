/**
 * A Manifold CSG primitive. Using procedural meshes is preferred over this as
 * Manifold always creates surfaces with smooth normals, no tangents and no
 * texture coordinates.
 */
export type CSGPrimitive = {
    primitive: 'cube',
    size?: [number, number, number] | number,
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