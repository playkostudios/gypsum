// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { normalFromTriangle } from './mesh-gen/normal-from-triangle';
import VertexHasher from './VertexHasher';

const MAX_INDEX_BUFFER_SIZE = 4294967296;

/**
 * Maps a manifold triangle index to a WLE submesh index. The format is:
 * [0]: submesh index of manifold triangle 0
 * [1]: triangle index of manifold triangle 0
 * [2]: submesh index of manifold triangle 1
 * [3]: triangle index of manifold triangle 1
 * ...
 * [2n]: submesh index of manifold triangle n
 * [2n + 1]: triangle index of manifold triangle n
 */
export type SubmeshMap = Float32Array;

export type Submesh = [mesh: WL.Mesh, material: WL.Material];

export abstract class BaseManifoldWLMesh {
    /**
     * WARNING: the submeshes array and the manifold mesh will have their
     * ownership tranferred to this object. if you modify them later, they will
     * be modified here as well, possibly corrupting the mesh. to avoid issues
     * with this, do a deep clone of the inputs
     */
    constructor(protected submeshes: Array<Submesh> = [], protected premadeManifoldMesh?: Mesh, protected submeshMap?: SubmeshMap) {}

    get manifoldMesh(): Mesh {
        if (!this.premadeManifoldMesh) {
            const wleMeshes = new Array<WL.Mesh>(this.submeshes.length);

            let i = 0;
            for (const [wleMesh, _material] of this.submeshes) {
                wleMeshes[i++] = wleMesh;
            }

            [this.submeshMap, this.premadeManifoldMesh] = BaseManifoldWLMesh.manifoldFromWLE(wleMeshes);
        }

        return this.premadeManifoldMesh;
    }

    abstract clone(): BaseManifoldWLMesh;

    get submeshCount(): number {
        return this.submeshes.length;
    }

    getSubmesh(submeshIdx: number): Submesh {
        const submesh = this.submeshes[submeshIdx];

        if (!submesh) {
            throw new Error(`No submesh exists at index ${submeshIdx}`);
        }

        return submesh;
    }

    getSubmeshes(): Array<Submesh> {
        const submeshes = new Array(this.submeshCount);

        for (let i = 0; i < this.submeshCount; i++) {
            const submesh = this.submeshes[i];
            submeshes[i] = [submesh[0], submesh[1]];
        }

        return submeshes;
    }

    getTriBarySubmesh(triIdx: number): [submesh: Submesh, iTriOrig: number] {
        if (!this.submeshMap) {
            throw new Error('Missing submesh map');
        }

        const offset = triIdx * 2;
        return [
            this.getSubmesh(this.submeshMap[offset]),
            this.submeshMap[offset + 1]
        ];
    }

    static manifoldToWLE(mesh: Mesh): WL.Mesh {
        // XXX only for debugging, hence the inneficient non-indexed vertices
        // (works with MeshVisualizer)
        const triCount = mesh.triVerts.length;
        const indexCount = triCount * 3;
        const indexData = new Uint32Array(indexCount);

        for (let i = 0; i < indexCount; i++) {
            indexData[i] = i;
        }

        const wleMesh = new WL.Mesh({ indexData, indexType: WL.MeshIndexType.UnsignedInt, vertexCount: indexCount });

        const positions = wleMesh.attribute(WL.MeshAttribute.Position);
        const normals = wleMesh.attribute(WL.MeshAttribute.Normal);

        let j = 0;
        for (let i = 0; i < triCount; i++) {
            const tri = mesh.triVerts[i];

            const a = tri[0];
            const b = tri[1];
            const c = tri[2];
            const aPos = mesh.vertPos[a];
            const bPos = mesh.vertPos[b];
            const cPos = mesh.vertPos[c];

            if (normals) {
                if (mesh.vertNormal) {
                    normals.set(j, mesh.vertNormal[a]);
                    normals.set(j + 1, mesh.vertNormal[b]);
                    normals.set(j + 2, mesh.vertNormal[c]);
                } else {
                    const normal = normalFromTriangle(aPos, bPos, cPos);
                    normals.set(j, normal);
                    normals.set(j + 1, normal);
                    normals.set(j + 2, normal);
                }
            }

            positions.set(j++, aPos);
            positions.set(j++, bPos);
            positions.set(j++, cPos);
        }

        return wleMesh;
    }

    static manifoldFromWLE(wleMeshes: WL.Mesh | Array<WL.Mesh>): [submeshMap: SubmeshMap, manifoldMesh: Mesh];
    static manifoldFromWLE(wleMeshes: WL.Mesh | Array<WL.Mesh>, genSubmeshMap: true): [submeshMap: SubmeshMap, manifoldMesh: Mesh];
    static manifoldFromWLE(wleMeshes: WL.Mesh | Array<WL.Mesh>, genSubmeshMap: false): Mesh;
    static manifoldFromWLE(wleMeshes: WL.Mesh | Array<WL.Mesh>, genSubmeshMap = true): Mesh | [submeshMap: SubmeshMap, manifoldMesh: Mesh] {
        if (!Array.isArray(wleMeshes)) {
            wleMeshes = [wleMeshes];
        }

        // try to make manifold from mesh. this will fail if there are
        // disconnected faces that have edges with the same position (despite
        // being different edges)
        // validate vertex count
        let totalVertexCount = 0;

        for (const wleMesh of wleMeshes) {
            const packedVertexCount = wleMesh.vertexCount;
            const indexData = wleMesh.indexData;
            const vertexCount = indexData === null ? packedVertexCount : indexData.length;

            if (vertexCount % 3 !== 0) {
                throw new Error(`Mesh has an invalid vertex count (${vertexCount}). Must be a multiple of 3`);
            }

            totalVertexCount += vertexCount;
        }

        const totalTriCount = totalVertexCount / 3;
        const mesh = {
            vertPos: new Array<Vec3>(),
            triVerts: new Array<Vec3>(totalTriCount)
        }
        const hasher = new VertexHasher();
        const submeshMap = genSubmeshMap ? new Float32Array(totalTriCount * 2) : null;
        let jm = 0;
        let js = 0;

        for (let submeshIdx = 0; submeshIdx < wleMeshes.length; submeshIdx++) {
            // prepare accessors
            const wleMesh = wleMeshes[submeshIdx];
            const positions = wleMesh.attribute(WL.MeshAttribute.Position);
            const packedVertexCount = wleMesh.vertexCount;
            const indexData = wleMesh.indexData;
            const vertexCount = indexData === null ? packedVertexCount : indexData.length;

            // convert positions
            const mergedIndices = new Array<number>();
            for (let i = 0; i < packedVertexCount; i++) {
                const pos = positions.get(i);

                if (hasher.isUnique(pos)) {
                    mergedIndices.push(mesh.vertPos.length);
                    mesh.vertPos.push(pos);
                } else {
                    const [x, y, z] = pos;
                    let k = 0;
                    for (; k < mesh.vertPos.length; k++) {
                        const [ox, oy, oz] = mesh.vertPos[k];
                        if (ox === x && oy === y && oz === z) {
                            break;
                        }
                    }

                    if (k === mesh.vertPos.length) {
                        mergedIndices.push(mesh.vertPos.length);
                        mesh.vertPos.push(pos);
                    } else {
                        mergedIndices.push(k);
                    }
                }
            }

            // make triangles
            let tri = 0;
            if (indexData === null) {
                for (let i = 0; i < vertexCount;) {
                    mesh.triVerts[jm++] = [
                        mergedIndices[i++],
                        mergedIndices[i++],
                        mergedIndices[i++]
                    ];

                    if (submeshMap) {
                        submeshMap[js++] = submeshIdx;
                        submeshMap[js++] = tri++;
                    }
                }
            } else {
                for (let i = 0; i < vertexCount;) {
                    mesh.triVerts[jm++] = [
                        mergedIndices[indexData[i++]],
                        mergedIndices[indexData[i++]],
                        mergedIndices[indexData[i++]]
                    ];

                    if (submeshMap) {
                        submeshMap[js++] = submeshIdx;
                        submeshMap[js++] = tri++;
                    }
                }
            }
        }

        if (jm !== mesh.triVerts.length) {
            throw new Error('Unexpected manifold triangle count');
        }

        if (submeshMap) {
            if (js !== submeshMap.length) {
                throw new Error(`Unexpected iterator position for submeshMap; expected ${submeshMap.length}, got ${js}`);
            }

            return [submeshMap, mesh];
        } else {
            return mesh;
        }
    }

    static makeIndexBuffer(size: number): [indexData: Uint8Array, indexType: WL.MeshIndexType] | [indexData: Uint16Array, indexType: WL.MeshIndexType] | [indexData: Uint32Array, indexType: WL.MeshIndexType] {
        if (size < 256) {
            return [new Uint8Array(size), WL.MeshIndexType.UnsignedByte];
        } else if (size < 65536) {
            return [new Uint16Array(size), WL.MeshIndexType.UnsignedShort];
        } else if (size < MAX_INDEX_BUFFER_SIZE) {
            return [new Uint32Array(size), WL.MeshIndexType.UnsignedInt];
        } else {
            throw new Error(`Maximum index buffer size exceeded (${MAX_INDEX_BUFFER_SIZE})`);
        }
    }
}