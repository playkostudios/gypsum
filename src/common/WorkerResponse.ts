import type { Box, Curvature, Properties } from 'manifold-3d';
import type { EncodedMeshGroup } from './EncodedMeshGroup';

/** The type of a {@link WorkerResult} */
export enum WorkerResultType {
    /** The value should be returned as-is, without any decoding */
    Passthrough,
    /** The value should be decoded as a MeshGroup */
    MeshGroup,
}

/** A {@link WorkerResult} value that is passed through as-is */
export type WorkerResultPassthroughValue = boolean | number | Box | Properties | Curvature;

/**
 * A result from a CSG operation; either a value that is passed-through, or a
 * MeshGroup that needs to be decoded.
 */
export type WorkerResult = [type: WorkerResultType.Passthrough, value: WorkerResultPassthroughValue] | [type: WorkerResultType.MeshGroup, value: EncodedMeshGroup];

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