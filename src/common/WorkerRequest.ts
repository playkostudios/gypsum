import type { CSGOperation } from './CSGOperation';

export type WorkerOperation = CSGOperation<[meshID: number, mesh: Mesh]>;
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