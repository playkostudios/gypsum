// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { CSGOperation } from '../common/CSGOperation';
import { iterateOpTree } from '../common/iterate-operation-tree';
import { WorkerResponse } from '../common/WorkerResponse';
import { vec3 } from 'gl-matrix';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';

import type { WorkerRequest } from '../common/WorkerRequest';
import type { OpTreeCtx } from '../common/iterate-operation-tree';
import type { StrippedMesh } from '../common/StrippedMesh';

type MeshArr = Array<[mesh: WL.Mesh, material: WL.Material | null]>;
type WorkerTuple = [worker: Worker, jobCount: number];
type WorkerArray = Array<WorkerTuple>;
type JobResult = MeshArr | boolean | number | Box | Properties | Curvature;
type JobTuple = [resolve: (value: JobResult) => void, reject: (reason: unknown) => void, origMeshes: Array<BaseManifoldWLMesh | WL.Mesh>, workerID: number];

function getFromBary(vecSize: number, a: number, b: number, c: number, aBary: Vec3, bBary: Vec3, cBary: Vec3, origAccessor: WL.MeshAttributeAccessor): [aVec: Array<number>, bVec: Array<number>, cVec: Array<number>] {
    const aOrigVal = origAccessor.get(a);
    const bOrigVal = origAccessor.get(b);
    const cOrigVal = origAccessor.get(c);
    const aVec = new Array(vecSize);
    const cVec = new Array(vecSize);
    const bVec = new Array(vecSize);

    for (let i = 0; i < vecSize; i++) {
        aVec[i] = aOrigVal[i] * aBary[0] + bOrigVal[i] * aBary[1] + cOrigVal[i] * aBary[2];
        bVec[i] = aOrigVal[i] * bBary[0] + bOrigVal[i] * bBary[1] + cOrigVal[i] * bBary[2];
        cVec[i] = aOrigVal[i] * cBary[0] + bOrigVal[i] * cBary[1] + cOrigVal[i] * cBary[2];
    }

    return [aVec, bVec, cVec];
}

function setFromBary(i: number, vecSize: number, a: number, b: number, c: number, aBary: Vec3, bBary: Vec3, cBary: Vec3, origAccessor: WL.MeshAttributeAccessor, buffer: Float32Array) {
    const [aVec, bVec, cVec] = getFromBary(vecSize, a, b, c, aBary, bBary, cBary, origAccessor);
    buffer.set(aVec, i);
    i += vecSize;
    buffer.set(bVec, i);
    i += vecSize;
    buffer.set(cVec, i);
}

export class CSGPool {
    private wantedWorkerCount: number;
    private workerPath: string;
    private libraryPath: string;
    private workers: WorkerArray | null = null;
    private nextJobID = 0;
    private jobs = new Map<number, JobTuple>();
    private disposed = false;

    constructor(workerCount: number | null = null, workerPath = 'manifold-wle.worker.min.js', libraryPath = 'manifold.js') {
        this.wantedWorkerCount = Math.max(
            1, workerCount ?? Math.ceil(navigator.hardwareConcurrency / 2)
        );
        this.workerPath = workerPath;
        this.libraryPath = libraryPath;
    }

    private terminateWorkers() {
        if (this.workers) {
            for (const [worker, _jobCount] of this.workers) {
                worker.postMessage({ type: 'terminate' });
            }
        }
    }

    dispose() {
        this.terminateWorkers();
        this.disposed = true;
    }

    private toManifoldMesh(wleMesh: BaseManifoldWLMesh | WL.Mesh): StrippedMesh {
        if (wleMesh instanceof BaseManifoldWLMesh) {
            return wleMesh.manifoldMesh;
        } else if(wleMesh instanceof WL.Mesh) {
            return BaseManifoldWLMesh.manifoldFromWLE(wleMesh, false);
        } else {
            return wleMesh;
        }
    }

    private meshToWLEArr(mesh: StrippedMesh, meshRelation: MeshRelation, meshIDMap: Map<number, BaseManifoldWLMesh | WL.Mesh>): MeshArr {
        // validate triangle count
        const triCount = mesh.triVerts.length / 3;

        if (triCount === 0) {
            return [];
        }

        // map triangles to materials
        const vertexArrays = new Map<WL.Material | null, Map<WL.Mesh | null, Array<[triIdx: number, origTriIdx: number]>>>();
        let iTri = 0;
        for (; iTri < triCount; iTri++) {
            // get original triangle
            const triBary = meshRelation.triBary[iTri];
            const origMesh = meshIDMap.get(triBary.originalID);
            let wleMesh: WL.Mesh | null;
            let material: WL.Material;
            let iTriOrig = iTri;

            if (origMesh instanceof BaseManifoldWLMesh) {
                [[wleMesh, material], iTriOrig] = origMesh.getTriBarySubmesh(triBary.tri);
            } else {
                material = null;
                wleMesh = origMesh;
            }

            // get vertex array map (wle mesh -> va)
            let vaMap = vertexArrays.get(material);
            if (!vaMap) {
                vaMap = new Map();
                vertexArrays.set(material, vaMap);
            }

            // get vertex array
            let va = vaMap.get(wleMesh);
            if (!va) {
                va = [];
                vaMap.set(wleMesh, va);
            }

            // add triangle points to vertex array
            va.push([iTri, iTriOrig]);
        }

        // make mesh for each vertex array
        const meshArr: MeshArr = [];

        for (const [material, vaMap] of vertexArrays) {
            // count triangles in vertex array
            let vaTotalTriCount = 0;
            for (const va of vaMap.values()) {
                vaTotalTriCount += va.length;
            }

            // make index buffer
            const vertexCount = vaTotalTriCount * 3;
            // XXX no vertex merging
            const [indexData, indexType] = BaseManifoldWLMesh.makeIndexBuffer(vertexCount, vertexCount);

            for (let i = 0; i < vertexCount; i++) {
                indexData[i] = i;
            }

            // make mesh from index buffer
            const wleMesh = new WL.Mesh({ vertexCount, indexType, indexData });
            const positions = wleMesh.attribute(WL.MeshAttribute.Position);

            const tangents = wleMesh.attribute(WL.MeshAttribute.Tangent);
            const normals = wleMesh.attribute(WL.MeshAttribute.Normal);
            const texCoords = wleMesh.attribute(WL.MeshAttribute.TextureCoordinate);
            const colors = wleMesh.attribute(WL.MeshAttribute.Color);
            // TODO joint support?
            const hasExtra: boolean = (tangents || normals || texCoords || colors);

            const positionBuffer = new Float32Array(vertexCount * 3);

            let tangentBuffer: Float32Array | undefined;
            if (tangents) {
                tangentBuffer = new Float32Array(vertexCount * 4);
            }

            let normalBuffer: Float32Array | undefined;
            if (normals) {
                normalBuffer = new Float32Array(vertexCount * 3);
            }

            let texCoordBuffer: Float32Array | undefined;
            if (texCoords) {
                texCoordBuffer = new Float32Array(vertexCount * 2);
            }

            let colorBuffer: Float32Array | undefined;
            if (colors) {
                colorBuffer = new Float32Array(vertexCount * 4);
            }

            let j2 = 0, j3 = 0, j4 = 0;
            for (const [origMesh, va] of vaMap) {
                const vaTriCount = va.length;

                for (let i = 0; i < vaTriCount; i++, j2 += 6, j3 += 9, j4 += 12) {
                    const [triIdx, origTriIdx] = va[i];
                    const triIdxOffset = triIdx * 3;
                    const triIndices = mesh.triVerts.slice(triIdxOffset, triIdxOffset + 3);
                    const triBary = meshRelation.triBary[triIdx];

                    const posOffset0 = triIndices[0] * 3;
                    const posOffset1 = triIndices[1] * 3;
                    const posOffset2 = triIndices[2] * 3;
                    const aPosNew = mesh.vertPos.slice(posOffset0, posOffset0 + 3);
                    const bPosNew = mesh.vertPos.slice(posOffset1, posOffset1 + 3);
                    const cPosNew = mesh.vertPos.slice(posOffset2, posOffset2 + 3);

                    if (hasExtra && origMesh) {
                        const aBaryIdx = triBary.vertBary[0];
                        const bBaryIdx = triBary.vertBary[1];
                        const cBaryIdx = triBary.vertBary[2];

                        let aBary: Vec3;
                        if (aBaryIdx < 0) {
                            aBary = [[1, 0, 0], [0, 1, 0], [0, 0, 1]][aBaryIdx + 3] as Vec3;
                        } else {
                            aBary = meshRelation.barycentric[aBaryIdx];
                        }

                        let bBary: Vec3;
                        if (bBaryIdx < 0) {
                            bBary = [[1, 0, 0], [0, 1, 0], [0, 0, 1]][bBaryIdx + 3] as Vec3;
                        } else {
                            bBary = meshRelation.barycentric[bBaryIdx];
                        }

                        let cBary: Vec3;
                        if (cBaryIdx < 0) {
                            cBary = [[1, 0, 0], [0, 1, 0], [0, 0, 1]][cBaryIdx + 3] as Vec3;
                        } else {
                            cBary = meshRelation.barycentric[cBaryIdx];
                        }

                        let a: number, b: number, c: number;
                        if (origMesh.indexData) {
                            let triOffset = origTriIdx * 3;
                            a = origMesh.indexData[triOffset++];
                            b = origMesh.indexData[triOffset++];
                            c = origMesh.indexData[triOffset];
                        } else {
                            a = origTriIdx * 3;
                            b = a + 1;
                            c = b + 1;
                        }

                        if (tangentBuffer) {
                            const origTangents = origMesh.attribute(WL.MeshAttribute.Tangent);
                            if (origTangents) {
                                // TODO handle transforms and flips
                                setFromBary(j4, 4, a, b, c, aBary, bBary, cBary, origTangents, tangentBuffer);
                            }
                        }

                        if (normalBuffer) {
                            const origPositions = origMesh.attribute(WL.MeshAttribute.Position);
                            const origNormals = origMesh.attribute(WL.MeshAttribute.Normal);

                            if (origPositions && origNormals) {
                                const [aVec, bVec, cVec] = getFromBary(3, a, b, c, aBary, bBary, cBary, origNormals);

                                // get original face normal
                                const bOrig = origPositions.get(b);
                                const abOrig = vec3.sub(vec3.create(), bOrig, origPositions.get(a));
                                const bcOrig = vec3.sub(vec3.create(), origPositions.get(c), bOrig);
                                const faceOrig = vec3.cross(vec3.create(), abOrig, bcOrig);
                                vec3.normalize(faceOrig, faceOrig);

                                // get new face normal
                                const abNew = vec3.sub(vec3.create(), bPosNew, aPosNew);
                                const bcNew = vec3.sub(vec3.create(), cPosNew, bPosNew);
                                const faceNew = vec3.cross(vec3.create(), abNew, bcNew);
                                vec3.normalize(faceNew, faceNew);

                                // NOTE this doesn't work if, for some bizarre
                                // reason, vertex normals are pointing inside
                                // the solid on purpose
                                // TODO handle transforms and flips

                                // negate normals if necessary
                                if (vec3.dot(faceOrig, faceNew) < 0) {
                                    vec3.negate(aVec as Vec3, aVec as Vec3);
                                    vec3.negate(bVec as Vec3, bVec as Vec3);
                                    vec3.negate(cVec as Vec3, cVec as Vec3);
                                }

                                // set normals
                                normalBuffer.set(aVec, j3);
                                normalBuffer.set(bVec, j3 + 3);
                                normalBuffer.set(cVec, j3 + 6);
                            }
                        }

                        if (texCoordBuffer) {
                            const origTexCoords = origMesh.attribute(WL.MeshAttribute.TextureCoordinate);
                            if (origTexCoords) {
                                setFromBary(j2, 2, a, b, c, aBary, bBary, cBary, origTexCoords, texCoordBuffer);
                            }
                        }

                        if (colorBuffer) {
                            const origColors = origMesh.attribute(WL.MeshAttribute.Color);
                            if (origColors) {
                                setFromBary(j4, 4, a, b, c, aBary, bBary, cBary, origColors, colorBuffer);
                            }
                        }
                    }

                    positionBuffer.set(aPosNew, j3);
                    positionBuffer.set(bPosNew, j3 + 3);
                    positionBuffer.set(cPosNew, j3 + 6);
                }
            }

            positions.set(0, positionBuffer);

            if (tangentBuffer) {
                tangents.set(0, tangentBuffer);
            }

            if (normalBuffer) {
                normals.set(0, normalBuffer);
            }

            if (texCoordBuffer) {
                texCoords.set(0, texCoordBuffer);
            }

            if (colorBuffer) {
                colors.set(0, colorBuffer);
            }

            meshArr.push([wleMesh, material]);
        }

        return meshArr;
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
                            libraryPath: this.libraryPath
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
                        const jobWorkerID = job[3];

                        if (workerID === jobWorkerID) {
                            rejectedJobs.unshift(jobID);
                        } else if (workerID !== null && workerID < jobWorkerID) {
                            job[3]--;
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

                    const [jobResolve, jobReject, origMap, _jobWorkerID] = job;
                    if (event.data.success) {
                        const result = event.data.result;

                        if (Array.isArray(result)) {
                            const [mesh, meshRelation, meshIDMap] = result;
                            const mappedOrigMap = new Map<number, BaseManifoldWLMesh | WL.Mesh>();

                            for (const [src, dst] of meshIDMap) {
                                const orig = origMap[dst];
                                if (orig) {
                                    mappedOrigMap.set(src, orig);
                                }
                            }

                            jobResolve(this.meshToWLEArr(mesh, meshRelation, mappedOrigMap));
                        } else {
                            jobResolve(result);
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

    private async initialize(): Promise<void> {
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

    async dispatch(operation: CSGOperation<BaseManifoldWLMesh | WL.Mesh>): Promise<JobResult> {
        try {
            if (this.disposed) {
                throw new Error('Cannot dispatch jobs to a disposed CSGPool');
            }

            if (!this.workers) {
                await this.initialize();
            }

            if ((this.workers as WorkerArray).length === 0) {
                throw new Error('All workers failed to initialize');
            }
        } catch(e) {
            iterateOpTree<BaseManifoldWLMesh | WL.Mesh>(operation, (_context: OpTreeCtx<BaseManifoldWLMesh | WL.Mesh>, _key: number | string, mesh: BaseManifoldWLMesh | WL.Mesh) => {
                if (mesh instanceof BaseManifoldWLMesh && mesh.autoDispose) {
                    mesh.dispose();
                }
            });

            throw e;
        }

        const origMap = new Array<BaseManifoldWLMesh | WL.Mesh>();

        try {
            let nextMeshID = 0;
            const transfer = new Array<Transferable>();
            iterateOpTree<BaseManifoldWLMesh | WL.Mesh>(operation, (context: OpTreeCtx<BaseManifoldWLMesh | WL.Mesh>, key: number | string, mesh: BaseManifoldWLMesh | WL.Mesh) => {
                // mesh
                const converted = this.toManifoldMesh(mesh);
                transfer.push(converted.triVerts.buffer, converted.vertPos.buffer);
                context[key] = [nextMeshID++, converted];
                origMap.push(mesh);
                transfer
            });

            const [bestIdx, best] = this.getBestWorker();
            best[1]++;
            const jobID = this.nextJobID++;

            return await new Promise((resolve, reject) => {
                this.jobs.set(jobID, [resolve, reject, origMap, bestIdx]);
                best[0].postMessage(<WorkerRequest>{
                    type: 'operation', jobID, operation
                }, transfer);
            });
        } finally {
            for (const mesh of origMap) {
                if (mesh instanceof BaseManifoldWLMesh && mesh.autoDispose) {
                    mesh.dispose();
                }
            }
        }
    }
}