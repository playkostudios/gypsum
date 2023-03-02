import type { Box, Curvature, Properties } from 'manifold-3d';
import type { StrippedMesh } from './StrippedMesh';

/**
 * An object that contains all information required to map a MeshJS from a
 * Manifold back to a MeshGroup.
 */
export type MeshGroupMapping = {
    faceID: Uint32Array,
    runIndex: Uint32Array,
    runMappedID: Uint32Array,
    runTransform: Float32Array,
};

/**
 * A result from a CSG operation with a serialized manifold, mesh transforms and
 * ID map.
 */
export type WorkerResult = [strippedMesh: StrippedMesh, mapping: MeshGroupMapping] | boolean | number | Box | Properties | Curvature;

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