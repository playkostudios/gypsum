// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { CSGOperation } from '../common/CSGOperation';
import WorkerResponse from '../worker/WorkerResponse';

type WorkerTuple = [worker: Worker, jobCount: number];
type WorkerArray = Array<WorkerTuple>;

export default class ManifoldPool {
    private wantedWorkerCount: number;
    private workerPath: string;
    private libraryPath: string;
    private workers: WorkerArray | null = null;
    private nextJobID = 0;
    private jobs = new Map<number, [resolve: (value: WL.Mesh) => void, reject: (reason: unknown) => void]>();

    constructor(workerCount: number | null = null, workerPath = 'manifold-wle.esm.min.js', libraryPath = 'manifold.min.js') {
        this.wantedWorkerCount = Math.max(
            1, workerCount ?? Math.ceil(navigator.hardwareConcurrency / 2)
        );
        this.workerPath = workerPath;
        this.libraryPath = libraryPath;
    }

    meshFromWLE(wleMesh: WL.Mesh): Mesh {
        // validate vertex count
        const indexData = wleMesh.indexData;
        const vertexCount = indexData === null ? wleMesh.vertexCount : indexData.length;

        if (vertexCount % 3 !== 0) {
            throw new Error(`Mesh has an invalid vertex count (${vertexCount}). Must be a multiple of 3`);
        }

        // prepare accessors
        // TODO handle uvs by restoring them afterwards with mesh relationships
        const positions = wleMesh.attribute(WL.MeshAttribute.Position);
        const normals = wleMesh.attribute(WL.MeshAttribute.Normal);

        const mesh = <Mesh>{
            vertPos: new Array<Vec3>,
            triVerts: new Array<Vec3>,
        }

        if (normals) {
            mesh.vertNormal = new Array<Vec3>();
        }

        // convert
        if (indexData === null) {
            for (let i = 0; i < vertexCount; i++) {
                mesh.vertPos.push(positions.get(i));
                if (normals) {
                    (mesh.vertNormal as Array<Vec3>).push(normals.get(i));
                }
            }

            for (let i = 0; i < vertexCount; i += 3) {
                mesh.triVerts.push([i, i + 1, i + 2]);
            }
        } else {
            for (let i = 0; i < vertexCount; i++) {
                const idx = indexData[i];
                mesh.vertPos.push(positions.get(idx));
                if (normals) {
                    (mesh.vertNormal as Array<Vec3>).push(normals.get(idx));
                }
            }

            for (let i = 0; i < vertexCount; i += 3) {
                mesh.triVerts.push([indexData[i], indexData[i + 1], indexData[i + 2]]);
            }
        }

        return mesh;
    }

    private meshToWLE(mesh: Mesh): WL.Mesh {
        // make index buffer
        const triCount = mesh.triVerts.length;
        const vertexCount = triCount * 3;
        let indexType: WL.MeshIndexType, indexData: Uint8Array | Uint16Array | Uint32Array;
        if (vertexCount <= 255) {
            indexType = WL.MeshIndexType.UnsignedByte;
            indexData = new Uint8Array(vertexCount);
        } else if (vertexCount <= 65535) {
            indexType = WL.MeshIndexType.UnsignedShort;
            indexData = new Uint16Array(vertexCount);
        } else {
            indexType = WL.MeshIndexType.UnsignedInt;
            indexData = new Uint32Array(vertexCount);
        }

        for (let i = 0, j = 0; i < triCount; i++) {
            const [a, b, c] = mesh.triVerts[i];
            indexData[j++] = a;
            indexData[j++] = b;
            indexData[j++] = c;
        }

        // make mesh from index buffer
        const wleMesh = new WL.Mesh({ vertexCount, indexType, indexData });
        const positions = wleMesh.attribute(WL.MeshAttribute.Position);
        let normals;

        if (mesh.vertNormal) {
            normals = wleMesh.attribute(WL.MeshAttribute.Position);
        }

        const mergedVertexCount = mesh.vertPos.length;
        for (let i = 0; i < mergedVertexCount; i++) {
            positions.set(i, mesh.vertPos[i]);

            if (normals) {
                normals.set(i, (mesh.vertNormal as Array<Vec3>)[i]);
            }
        }

        return wleMesh;
    }

    private async initializeSingle(displayID: number): Promise<void> {
        const worker = new Worker(this.workerPath, { name: `manifold-worker-${displayID}` });

        return new Promise((resolve, reject) => {
            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                switch(event.data.type) {
                case 'created':
                    worker.postMessage({ type: 'initialize', libraryPath: this.libraryPath });
                    break;
                case 'ready':
                    resolve();
                    break;
                case 'terminated':
                    // TODO handle already dispatched jobs
                    if (this.workers) {
                        for (const [i, [otherWorker, _jobCount]] of this.workers.entries()) {
                            if (otherWorker === worker) {
                                this.workers.splice(i, 1);
                                break;
                            }
                        }
                    }

                    worker.terminate();
                    reject();
                    break;
                case 'result':
                {
                    const job = this.jobs.get(event.data.jobID);
                    if (!job) {
                        console.warn(`Ignored invalid job ID (${event.data.jobID})`);
                        break;
                    }

                    const [jobResolve, jobReject] = job;
                    if (event.data.success) {
                        jobResolve(this.meshToWLE(event.data.mesh));
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

    private async initialize(): Promise<void> {
        this.workers = [];
        const promises = new Array<Promise<unknown>>();

        for (let i = 0; i < this.wantedWorkerCount; i++) {
            promises.push(this.initializeSingle(i));
        }

        await Promise.allSettled(promises);

        if (this.workers.length === 0) {
            throw new Error('No worker was successfuly created');
        }
    }

    private getBestWorker(): WorkerTuple {
        const workers = this.workers as WorkerArray;
        let bestWorker = workers[0];

        for (let i = 1; i < workers.length; i++) {
            const thisWorker = workers[i];

            if (thisWorker[1] < bestWorker[1]) {
                bestWorker = thisWorker;
            }
        }

        return bestWorker;
    }

    async dispatch(operation: CSGOperation<Mesh>) {
        if (!this.workers) {
            await this.initialize();
        }

        if ((this.workers as WorkerArray).length === 0) {
            throw new Error('All workers failed to initialize');
        }

        const best = this.getBestWorker();
        best[1]++;
        const jobID = this.nextJobID++;

        return await new Promise((resolve, reject) => {
            best[0].postMessage({ type: 'operation', jobID, operation });
            this.jobs.set(jobID, [resolve, reject]);
        });
    }
}