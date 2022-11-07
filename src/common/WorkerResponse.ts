export type WorkerIDMap = Array<[newID: number, originalID: number]>;
export type WorkerResult = [mesh: Mesh, meshRelation: MeshRelation, idMap: WorkerIDMap] | boolean | number | Box | Properties | Curvature;
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