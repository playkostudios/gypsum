type WorkerResponse = {
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
    mesh: Mesh,
} | {
    type: 'result',
    success: false,
    jobID: number,
    error: unknown,
};

export default WorkerResponse;