import type { StrippedMesh } from './StrippedMesh';
import type { CSGOperation } from './CSGOperation';

/** A CSG operation tree with serialized meshes. */
export type WorkerOperation = CSGOperation<[meshID: number, mesh: StrippedMesh]>;

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