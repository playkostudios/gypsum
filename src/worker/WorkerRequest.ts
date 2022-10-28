import { CSGOperation } from '../common/CSGOperation';

type WorkerRequest = {
    type: 'initialize',
    libraryPath: string,
} | {
    type: 'terminate',
} | {
    type: 'operation',
    jobID: number,
    operation: CSGOperation<Mesh>,
};

export default WorkerRequest;