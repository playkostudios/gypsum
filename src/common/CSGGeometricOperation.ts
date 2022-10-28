import type { CSGTree } from './CSGTree';

// XXX a geometric operation is an operation that returns a manifold (and
// therefore can be chained)

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
            matrix: Matrix3x4,
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

// XXX warp operation is not supported since you can't pass functions to web
// workers
// XXX sdf operation not supported for same reason