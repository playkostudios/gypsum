import type { CSGOperation } from './CSGOperation';
import type { EncodedMeshGroup } from './EncodedMeshGroup';

/** A CSG operation tree with serialized meshes. */
export type WorkerOperation = CSGOperation<EncodedMeshGroup>;

/** A request to a Gypsum worker. */
export type WorkerRequest = {
    type: 'initialize',
    libraryPath: string,
} | {
    type: 'terminate',
} | {
    type: 'operation',
    jobID: number,
    operation: WorkerOperation,
};