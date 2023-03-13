import type { Mat4, Polygons, Vec2, Vec3 } from 'manifold-3d';
import type { CSGTree } from './CSGTree';

/**
 * A CSG operation in a CSG operation tree that returns a manifold, and
 * therefore can be chained.
 */
export type CSGGeometricOperation<MeshType> = (
    {
        operation: 'add' | 'union' | 'subtract' | 'difference' | 'intersect' | 'intersection',
    } & (
        {
            left: CSGTree<MeshType> | MeshType,
            right: CSGTree<MeshType> | MeshType,
        } | {
            manifolds: Array<CSGTree<MeshType> | MeshType>,
        }
    )
) | (
    {
        manifold: CSGTree<MeshType> | MeshType,
    } & (
        {
            operation: 'translate',
            offset: Vec3,
        } | {
            operation: 'rotate',
            degrees: Vec3,
        } | {
            operation: 'scale',
            factor: Vec3 | number,
        } | {
            operation: 'transform',
            matrix: Mat4,
        } | {
            operation: 'refine',
            splits: number,
        } | {
            operation: 'asOriginal',
        }
    )
) | {
    operation: 'extrude',
    crossSection: Polygons,
    height: number,
    nDivisions?: number,
    twistDegrees?: number,
    scaleTop?: Vec2,
} | {
    operation: 'revolve',
    crossSection: Polygons,
    circularSegments?: number,
};

// TODO compose/decompose
// TODO warp and sdf (levelset) operation. callbacks can either be encoded, or
// passed as a script url