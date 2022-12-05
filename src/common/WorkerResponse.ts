import type { StrippedMesh } from './StrippedMesh';

/** An array which maps manifold IDs to mesh IDs. */
export type WorkerIDMap = Array<[newID: number, originalID: number]>;

/**
 * A result from a CSG operation with a serialized manifold, mesh relation and
 * ID map.
 */
export type WorkerResult = [strippedMesh: StrippedMesh, meshRelation: MeshRelation, idMap: WorkerIDMap] | boolean | number | Box | Properties | Curvature;

/** A response from a Gypsum worker. */
export type WorkerResponse = {
    type: 'created',
} | {
    type: 'ready',
} | {
    type: 'terminated',
} | {
    type: 'crash',
    error: unknown,
} | {
    type: 'result',
    success: true,
    jobID: number,
    result: WorkerResult,
} | {
    type: 'result',
    success: false,
    jobID: number,
    error: unknown,
};