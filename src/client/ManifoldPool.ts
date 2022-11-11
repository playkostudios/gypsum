// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { CSGOperation } from '../common/CSGOperation';
import { iterateOpTree } from '../common/iterate-operation-tree';
import { WorkerResponse } from '../common/WorkerResponse';
import { vec3 } from 'gl-matrix';
import { ManifoldWLMesh } from './ManifoldWLMesh';

import type { WorkerRequest } from '../common/WorkerRequest';

type MeshArr = Array<[mesh: WL.Mesh, material: WL.Material | null]>;
type WorkerTuple = [worker: Worker, jobCount: number];
type WorkerArray = Array<WorkerTuple>;
type JobResult = MeshArr | boolean | number | Box | Properties | Curvature;

function getFromBary(vecSize: number, a: number, b: number, c: number, aBary: Vec3, bBary: Vec3, cBary: Vec3, origAccessor: WL.MeshAttributeAccessor) {
    const aOrigVal = origAccessor.get(a);
    const bOrigVal = origAccessor.get(b);
    const cOrigVal = origAccessor.get(c);
    const aVec = new Array(vecSize);
    const cVec = new Array(vecSize);
    const bVec = new Array(vecSize);

    for (let j = 0; j < vecSize; j++) {
        aVec[j] = aOrigVal[j] * aBary[0] + bOrigVal[j] * aBary[1] + cOrigVal[j] * aBary[2];
        bVec[j] = aOrigVal[j] * bBary[0] + bOrigVal[j] * bBary[1] + cOrigVal[j] * bBary[2];
        cVec[j] = aOrigVal[j] * cBary[0] + bOrigVal[j] * cBary[1] + cOrigVal[j] * cBary[2];
    }

    return [aVec, bVec, cVec];
}

function setFromBary(i: number, vecSize: number, a: number, b: number, c: number, aBary: Vec3, bBary: Vec3, cBary: Vec3, origAccessor: WL.MeshAttributeAccessor, buffer: Float32Array) {
    const [aVec, bVec, cVec] = getFromBary(vecSize, a, b, c, aBary, bBary, cBary, origAccessor);
    buffer.set(aVec, i);
    buffer.set(bVec, i + vecSize);
    buffer.set(cVec, i + vecSize);
}

export class ManifoldPool {
    private wantedWorkerCount: number;
    private workerPath: string;
    private libraryPath: string;
    private workers: WorkerArray | null = null;
    private nextJobID = 0;
    private jobs = new Map<number, [resolve: (value: JobResult) => void, reject: (reason: unknown) => void, origMeshes: Array<Mesh | WL.Mesh>, materialMap: Map<WL.Mesh | Mesh, WL.Material>]>();

    constructor(workerCount: number | null = null, workerPath = 'manifold-wle.worker.min.js', libraryPath = 'manifold.js') {
        this.wantedWorkerCount = Math.max(
            1, workerCount ?? Math.ceil(navigator.hardwareConcurrency / 2)
        );
        this.workerPath = workerPath;
        this.libraryPath = libraryPath;
    }

    private meshFromWLE(wleMesh: ManifoldWLMesh | WL.Mesh): Mesh {
        if (wleMesh instanceof ManifoldWLMesh) {
            return wleMesh.manifoldMesh;
        } else {
            return ManifoldWLMesh.manifoldFromWLE(wleMesh);
        }
    }

    private meshToWLEArr(mesh: Mesh, meshRelation: MeshRelation, meshIDMap: Map<number, WL.Mesh | Mesh>, materialMap: Map<WL.Mesh | Mesh, WL.Material>): MeshArr {
        // validate triangle count
        const triCount = mesh.triVerts.length;

        if (triCount === 0) {
            return [];
        }

        // map triangles to materials
        const vertexArrays = new Map<WL.Material | null, Array<number>>();
        let iTri = 0;
        for (; iTri < triCount; iTri++) {
            // get original triangle
            const triBary = meshRelation.triBary[iTri];
            const origMesh = meshIDMap.get(triBary.originalID);
            const material = materialMap.get(origMesh) ?? null;

            // get vertex array
            let va = vertexArrays.get(material);
            if (!va) {
                va = [];
                vertexArrays.set(material, va);
            }

            // add triangle points to vertex array
            va.push(iTri);
        }

        // make mesh for each vertex array
        const meshArr: MeshArr = [];

        for (const [material, va] of vertexArrays) {
            // make index buffer
            const vaTriCount = va.length;
            const vertexCount = vaTriCount * 3;
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

            for (let i = 0, j2 = 0, j3 = 0, j4 = 0; i < vaTriCount; i++, j2 += 6, j3 += 9, j4 += 12) {
                const triIdx = va[i];
                const triIndices = mesh.triVerts[triIdx];
                const triBary = meshRelation.triBary[triIdx];
                const origMesh = meshIDMap.get(triBary.originalID);

                const aPosNew = mesh.vertPos[triIndices[0]];
                const bPosNew = mesh.vertPos[triIndices[1]];
                const cPosNew = mesh.vertPos[triIndices[2]];

                if (hasExtra && origMesh && origMesh instanceof WL.Mesh) {
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
                        let triOffset = triBary.tri * 3;
                        a = origMesh.indexData[triOffset++];
                        b = origMesh.indexData[triOffset++];
                        c = origMesh.indexData[triOffset];
                    } else {
                        a = triBary.tri * 3;
                        b = a + 1;
                        c = b + 1;
                    }

                    if (tangentBuffer) {
                        const origTangents = origMesh.attribute(WL.MeshAttribute.Tangent);
                        if (origTangents) {
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
                        const origTexCoords = origMesh.attribute(WL.MeshAttribute.Tangent);
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
                        // TODO
                    }
                    break;
                case 'ready':
                    if (stage === 1) {
                        stage++;
                        resolve();
                        (this.workers as WorkerArray).push([worker, 0]);
                    } else {
                        // TODO
                    }
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

                    const [jobResolve, jobReject, origMap, materialMap] = job;
                    if (event.data.success) {
                        const result = event.data.result;

                        if (Array.isArray(result)) {
                            const [mesh, meshRelation, meshIDMap] = result;
                            const mappedOrigMap = new Map<number, WL.Mesh | Mesh>();

                            for (const [src, dst] of meshIDMap) {
                                const orig = origMap[dst];
                                if (orig) {
                                    mappedOrigMap.set(src, orig);
                                }
                            }

                            console.log(result);

                            jobResolve(this.meshToWLEArr(mesh, meshRelation, mappedOrigMap, materialMap));
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

    async dispatch(operation: CSGOperation<ManifoldWLMesh | WL.Mesh | Mesh>, materialMap?: Map<ManifoldWLMesh | WL.Mesh | Mesh, WL.Material>): Promise<JobResult> {
        if (!this.workers) {
            await this.initialize();
        }

        if ((this.workers as WorkerArray).length === 0) {
            throw new Error('All workers failed to initialize');
        }

        let nextMeshID = 0;
        const meshIDMap = new Map<number, Mesh>();
        const origMap = new Array<WL.Mesh | Mesh>();
        iterateOpTree(operation, (context, key, mesh) => {
            // mesh
            let converted = mesh;
            if (mesh instanceof WL.Mesh) {
                converted = this.meshFromWLE(mesh);
            }

            meshIDMap.set(nextMeshID, mesh);
            context[key] = [nextMeshID++, converted];
            origMap.push(mesh);
        });

        const best = this.getBestWorker();
        best[1]++;
        const jobID = this.nextJobID++;

        const finalMaterialMap = new Map(materialMap?.entries());

        return await new Promise((resolve, reject) => {
            this.jobs.set(jobID, [resolve, reject, origMap, finalMaterialMap]);
            best[0].postMessage(<WorkerRequest>{
                type: 'operation', jobID, operation
            });
        });
    }
}