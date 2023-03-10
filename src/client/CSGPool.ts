import { CSGOperation } from '../common/CSGOperation';
import { iterateOpTree } from '../common/iterate-operation-tree';
import { WorkerResponse, WorkerResultType } from '../common/WorkerResponse';
import { MeshGroup, Submesh } from './MeshGroup';
import { Mesh } from '@wonderlandengine/api';

import type { WorkerRequest } from '../common/WorkerRequest';
import type { OpTreeCtx } from '../common/iterate-operation-tree';
import type { Box, Curvature, Properties } from 'manifold-3d';
import type { EncodedMeshGroup } from '../common/EncodedMeshGroup';
import type { Material } from '@wonderlandengine/api';
import type { WonderlandEngine } from '../common/backport-shim';

type WorkerTuple = [worker: Worker, jobCount: number];
type WorkerArray = Array<WorkerTuple>;
type JobResult = MeshGroup | boolean | number | Box | Properties | Curvature;
type JobTuple = [resolve: (value: JobResult) => void, reject: (reason: unknown) => void, engine: WonderlandEngine, materials: Array<Material>, workerID: number];

/**
 * A pool of workers to use for CSG operation with Manifold.
 */
export class CSGPool {
    private wantedWorkerCount: number;
    private workerPath: string;
    private manifoldPath: string;
    private workers: WorkerArray | null = null;
    private nextJobID = 0;
    private jobs = new Map<number, JobTuple>();
    private disposed = false;

    /**
     * Create a new pool of workers. Workers will only be initialized on the
     * first CSG operation, or after calling and waiting for
     * {@link CSGPool#initialize}.
     *
     * @param workerCount - The wanted amount of workers. Note that this is a target, not a requirement. If all but one worker fails to be created, no error will be thrown.
     * @param workerPath - The path to the Gypsum<->Manifold worker script. Points to "gypsum-manifold.worker.min.js" by default.
     * @param manifoldPath - The path to the Manifold WASM bindings library. Points to "manifold.js" by default.
     */
    constructor(workerCount: number | null = null, workerPath = 'gypsum-manifold.worker.min.js', manifoldPath = 'manifold.js') {
        this.wantedWorkerCount = Math.max(
            1, workerCount ?? Math.ceil(navigator.hardwareConcurrency / 2)
        );
        this.workerPath = workerPath;
        this.manifoldPath = manifoldPath;
    }

    private terminateWorkers() {
        if (this.workers) {
            for (const [worker, _jobCount] of this.workers) {
                worker.postMessage({ type: 'terminate' });
            }
        }
    }

    /**
     * Destroys all resources associated with this pool. All jobs assigned to
     * this pool are rejected, and all workers assigned to this pool are
     * terminated. Does nothing if the pool is already disposed.
     */
    dispose() {
        this.terminateWorkers();
        this.disposed = true;
    }

    private async initializeSingle(displayID: number): Promise<void> {
        const worker = new Worker(this.workerPath, { name: `manifold-worker-${displayID}` });

        return new Promise((resolve, reject) => {
            let stage = 0;
            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                switch(event.data.type) {
                case 'created':
                    if (stage === 0) {
                        stage++;
                        worker.postMessage({
                            type: 'initialize',
                            libraryPath: this.manifoldPath
                        });
                    } else {
                        console.warn('Unexpected "created" message from worker. Ignored');
                    }
                    break;
                case 'ready':
                    if (stage === 1) {
                        stage++;
                        resolve();
                        (this.workers as WorkerArray).push([worker, 0]);
                    } else {
                        console.warn('Unexpected "ready" message from worker. Ignored');
                    }
                    break;
                case 'terminated':
                {
                    // remove worker
                    let workerID: number | null = null;
                    if (this.workers) {
                        for (const [i, [otherWorker, _jobCount]] of this.workers.entries()) {
                            if (otherWorker === worker) {
                                this.workers.splice(i, 1);
                                workerID = i;
                                break;
                            }
                        }
                    }

                    // reject already dispatched jobs. if a job is assigned to
                    // a worker with an id higher than this worker's, then
                    // decrement the id to correct it
                    const rejectedJobs: Array<number> = [];
                    for (const [jobID, job] of this.jobs) {
                        const jobWorkerID = job[4];

                        if (workerID === jobWorkerID) {
                            rejectedJobs.unshift(jobID);
                        } else if (workerID !== null && workerID < jobWorkerID) {
                            job[4]--;
                        }
                    }

                    for (const jobID of rejectedJobs) {
                        (this.jobs.get(jobID) as JobTuple)[1](
                            new Error('Worker terminated before job could finish')
                        );
                        this.jobs.delete(jobID);
                    }

                    worker.terminate();
                    reject();
                    break;
                }
                case 'result':
                {
                    const jobID = event.data.jobID;
                    const job = this.jobs.get(jobID);
                    if (!job) {
                        console.warn(`Ignored invalid job ID (${event.data.jobID})`);
                        break;
                    }

                    this.jobs.delete(jobID);

                    const [jobResolve, jobReject, engine, materials, _jobWorkerID] = job;
                    if (event.data.success) {
                        const [resType, resValue] = event.data.result;

                        if (resType === WorkerResultType.MeshGroup) {
                            jobResolve(MeshGroup.fromEncodedMeshGroup(engine, resValue, materials));
                        } else {
                            jobResolve(resValue);
                        }
                    } else {
                        jobReject(event.data.error);
                    }
                    break;
                }
                default:
                    console.warn('Unexpected message from worker:', event.data);
                }
            }
        })
    }

    private async initializeImpl(): Promise<void> {
        if (this.disposed) {
            throw new Error('Disposed CSGPools cannot be initialized');
        }

        this.workers = [];
        const promises = new Array<Promise<unknown>>();

        for (let i = 0; i < this.wantedWorkerCount; i++) {
            promises.push(this.initializeSingle(i));
        }

        await Promise.allSettled(promises);

        if (this.workers.length === 0) {
            throw new Error('No worker was successfuly created');
        }

        if (this.disposed) {
            this.terminateWorkers();
            throw new Error('CSGPool was disposed while it was being initialized');
        }
    }

    private getBestWorker(): [bestWorkerIdx: number, bestWorker: WorkerTuple] {
        const workers = this.workers as WorkerArray;
        let bestWorkerIdx = 0;
        let bestWorker = workers[0];

        for (let i = 1; i < workers.length; i++) {
            const thisWorker = workers[i];

            if (thisWorker[1] < bestWorker[1]) {
                bestWorkerIdx = i;
                bestWorker = thisWorker;
            }
        }

        return [bestWorkerIdx, bestWorker];
    }

    /**
     * Initialize all the workers in this pool. Note that calling this is not
     * neccessary, but is recommended to avoid stuttering, as this is called
     * automatically on the first CSG operation.
     */
    async initialize(): Promise<void> {
        if (this.disposed) {
            throw new Error('Cannot initialize a disposed CSGPool');
        }

        if (!this.workers) {
            await this.initializeImpl();
        }

        if ((this.workers as WorkerArray).length === 0) {
            throw new Error('All workers failed to initialize');
        }
    }

    /**
     * Dispatch a tree of CSG operations to the best worker; first worker with
     * the least amount of running jobs.
     *
     * @param operation - A tree of CSG operations to send to the worker.
     */
    async dispatch(engine: WonderlandEngine, operation: CSGOperation<MeshGroup | Mesh | Submesh>): Promise<JobResult> {
        // TODO don't double-iterate the tree. find a better way to clean up
        const autoDisposeList = new Array<MeshGroup>();
        iterateOpTree<MeshGroup | Mesh | Submesh>(operation, (_context: OpTreeCtx<MeshGroup | Mesh | Submesh>, _key: number | string, mesh: MeshGroup | Mesh | Submesh) => {
            if (mesh instanceof MeshGroup && mesh.autoDispose) {
                autoDisposeList.push(mesh);
            }
        });

        try {
            await this.initialize();

            const materials = new Array<Material>();
            const transfer = new Array<Transferable>();

            iterateOpTree<MeshGroup | Mesh | Submesh>(operation, (context: OpTreeCtx<MeshGroup | Mesh | Submesh>, key: number | string, mesh: MeshGroup | Mesh | Submesh) => {
                // mesh
                let converted: EncodedMeshGroup;
                if (mesh instanceof MeshGroup) {
                    converted = mesh.encode(materials, transfer);
                } else if (mesh instanceof Mesh) {
                    converted = MeshGroup.fromWLEMesh(mesh).encode(materials, transfer);
                } else if (Array.isArray(mesh) && mesh[0] instanceof Mesh) {
                    converted = MeshGroup.fromWLEMesh(mesh[0], mesh[1]).encode(materials, transfer);
                } else {
                    throw new Error('Unknown mesh type');
                }

                // XXX this cast is safe, as we are converting the context from
                // containing MeshGroup/Mesh instances into EncodedMeshGroup
                // instances only
                (context as unknown as OpTreeCtx<EncodedMeshGroup>)[key] = converted;
            });

            const [bestIdx, best] = this.getBestWorker();
            best[1]++;
            const jobID = this.nextJobID++;

            return await new Promise((resolve, reject) => {
                this.jobs.set(jobID, [resolve, reject, engine, materials, bestIdx]);
                best[0].postMessage(<WorkerRequest>{
                    type: 'operation', jobID, operation
                }, transfer);
            });
        } finally {
            for (const mesh of autoDisposeList) {
                mesh.dispose();
            }
        }
    }
}