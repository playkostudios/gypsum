// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import VertexHasher from './mesh-gen/VertexHasher';
import { DynamicArray } from './mesh-gen/DynamicArray';
import { EPS } from './misc/EPS';
import { mat3, mat4, vec3, vec4 } from 'gl-matrix';

import type { StrippedMesh } from '../common/StrippedMesh';
import type { quat } from 'gl-matrix';

const MAX_INDEX = 0xFFFFFFFF;

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
export type SubmeshMap = Uint8Array | Uint16Array | Uint32Array;

/**
 * A pair containing a WL.Mesh instance and it's assigned WL.Material.
 */
export type Submesh = [mesh: WL.Mesh, material: WL.Material];

/**
 * A helper class which acts as a single mesh, but contains a list of submeshes,
 * where each submesh is assigned a different material.
 */
export class MeshGroup {
    /**
     * If this flag is set, then {@link MeshGroup#dispose} will be called after
     * a CSG operation is done. It's recommended to call {@link MeshGroup#mark}
     * instead of setting this manually, since the method is chainable.
     */
    autoDispose = false;

    /**
     * Create a new MeshGroup from a list of submeshes, a manifold, and a
     * submesh map, which maps triangles from the manifold to triangles from a
     * submesh.
     *
     * WARNING: The submeshes array and the manifold mesh will have their
     * ownership tranferred to this object. If you modify them later, they will
     * be modified here as well, possibly corrupting the mesh. To avoid issues
     * with this, do a deep clone of the inputs
     *
     * @param submeshes - The list of submeshes to assign to this group.
     * @param premadeManifoldMesh - A manifold which defines the topology of the submeshes.
     * @param submeshMap - A map which maps triangles in the manifold to triangles in a submesh.
     */
    constructor(protected submeshes: Array<Submesh> = [], protected premadeManifoldMesh: StrippedMesh | null = null, protected submeshMap: SubmeshMap | null = null) {}

    /**
     * Create a new MeshGroup from a WL.Mesh.
     *
     * WARNING: The submeshes array and the manifold mesh will have their
     * ownership tranferred to this object. If you modify them later, they will
     * be modified here as well, possibly corrupting the mesh. To avoid issues
     * with this, do a deep clone of the inputs
     *
     * @param mesh - A WL.Mesh instance.
     * @param material - A WL.Material instance. Null by default.
     */
    static fromWLEMesh(mesh: WL.Mesh, material: WL.Material = null) {
        return new MeshGroup([[ mesh, material ]]);
    }

    /**
     * Create a new empty MeshGroup. Useless on its own, only ever appears as a
     * fallback for CSG operations with no result.
     */
    static makeEmpty() {
        return new MeshGroup(
            [],
            <StrippedMesh>{
                vertPos: new Float32Array(0),
                triVerts: new Uint32Array(0),
            },
            new Uint8Array(0),
        );
    }

    /**
     * Get the manifold mesh of this MeshGroup. If the MeshGroup has no manifold
     * yet, then a manifold will be automatically generated and cached. Note
     * that this process can throw.
     */
    get manifoldMesh(): StrippedMesh {
        if (!this.premadeManifoldMesh) {
            const wleMeshes = new Array<WL.Mesh>(this.submeshes.length);

            let i = 0;
            for (const [wleMesh, _material] of this.submeshes) {
                wleMeshes[i++] = wleMesh;
            }

            [this.submeshMap, this.premadeManifoldMesh] = MeshGroup.manifoldFromWLE(wleMeshes);
        }

        return this.premadeManifoldMesh;
    }

    /**
     * Get the number of submeshes inside this MeshGroup.
     */
    get submeshCount(): number {
        return this.submeshes.length;
    }

    /**
     * Get the submeshes at a specific submesh index.
     *
     * @param submeshIdx - The index of the wanted submesh.
     * @returns A pair containing a WL.Mesh instance and a WL.Material instance.
     */
    getSubmesh(submeshIdx: number): Submesh {
        const submesh = this.submeshes[submeshIdx];

        if (!submesh) {
            throw new Error(`No submesh exists at index ${submeshIdx}`);
        }

        return submesh;
    }

    /**
     * Get the submeshes inside this MeshGroup.
     *
     * @returns A list of submeshes, where each submesh is a pair containing a WL.Mesh instance and a WL.Material instance.
     */
    getSubmeshes(): Array<Submesh> {
        const submeshes = new Array(this.submeshCount);

        for (let i = 0; i < this.submeshCount; i++) {
            const submesh = this.submeshes[i];
            submeshes[i] = [submesh[0], submesh[1]];
        }

        return submeshes;
    }

    /**
     * Get the submesh and triangle index which corresponds to a given manifold
     * triangle index.
     *
     * If submesh map is missing, then this will throw.
     *
     * @param triIdx - The manifold triangle index.
     * @returns A pair containing the submesh that this triangle index belongs to, and the triangle index in that submesh.
     */
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

    /**
     * Automatically create a manifold from given Wonderland Engine meshes. Note
     * that this method has issues with singularities and edges shared by more
     * than 2 triangles, since this is a vertex distance method instead of
     * better methods such as cutting and stitching.
     *
     * @param wleMeshes - A Wonderland Engine mesh, or a list of Wonderland Engine meshes, to convert to a manifold
     * @param genSubmeshMap - Should the submesh map be generated? True by default.
     * @returns Returns a tuple containing the submesh map, and a manifold. If genSubmeshMap is false, then the submesh map will be null.
     */
    static manifoldFromWLE(wleMeshes: WL.Mesh | Array<WL.Mesh>, genSubmeshMap = true): [submeshMap: SubmeshMap | null, manifoldMesh: StrippedMesh] {
        if (!Array.isArray(wleMeshes)) {
            wleMeshes = [wleMeshes];
        }

        // try to make manifold from mesh. this will fail if there are
        // disconnected faces that have edges with the same position (despite
        // being different edges)
        // validate vertex count
        let totalVertexCount = 0;
        let maxSubmeshTriCount = 0;
        let indexCount = 0;

        for (const wleMesh of wleMeshes) {
            const packedVertexCount = wleMesh.vertexCount;
            const indexData = wleMesh.indexData;
            indexCount = indexData === null ? packedVertexCount : indexData.length;

            if (indexCount % 3 !== 0) {
                throw new Error(`Mesh has an invalid index count (${indexCount}). Must be a multiple of 3`);
            }

            totalVertexCount += indexCount;
            maxSubmeshTriCount = Math.max(maxSubmeshTriCount, indexCount / 3);
        }

        const triVerts = new Uint32Array(totalVertexCount);
        const vertPos = new DynamicArray(Float32Array);
        const totalTriCount = totalVertexCount / 3;
        const hasher = new VertexHasher();
        const submeshMap = genSubmeshMap ? MeshGroup.makeSubmeshMapBuffer(totalTriCount, maxSubmeshTriCount, wleMeshes.length - 1) : null;
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
                    mergedIndices.push(vertPos.length / 3);
                    const offset = vertPos.length;
                    vertPos.length += 3;
                    vertPos.copy(offset, pos);
                } else {
                    const [x, y, z] = pos;
                    let k = 0;
                    for (; k < vertPos.length; k += 3) {
                        if (Math.abs(vertPos.get(k) - x) < EPS
                             && Math.abs(vertPos.get(k + 1) - y) < EPS
                             && Math.abs(vertPos.get(k + 2) - z) < EPS) {
                            break;
                        }
                    }

                    mergedIndices.push(k / 3);

                    if (k === vertPos.length) {
                        vertPos.length += 3;
                        vertPos.copy(k, pos);
                    }
                }
            }

            // make triangles
            let tri = 0;
            if (indexData === null) {
                for (let i = 0; i < vertexCount;) {
                    triVerts[jm++] = mergedIndices[i++];
                    triVerts[jm++] = mergedIndices[i++];
                    triVerts[jm++] = mergedIndices[i++];

                    if (submeshMap) {
                        submeshMap[js++] = submeshIdx;
                        submeshMap[js++] = tri++;
                    }
                }
            } else {
                for (let i = 0; i < vertexCount;) {
                    triVerts[jm++] = mergedIndices[indexData[i++]];
                    triVerts[jm++] = mergedIndices[indexData[i++]];
                    triVerts[jm++] = mergedIndices[indexData[i++]];

                    if (submeshMap) {
                        submeshMap[js++] = submeshIdx;
                        submeshMap[js++] = tri++;
                    }
                }
            }
        }

        if (jm !== triVerts.length) {
            throw new Error('Unexpected manifold triangle count');
        }

        const mesh = <StrippedMesh>{ vertPos: vertPos.finalize(), triVerts };

        if (submeshMap) {
            if (js !== submeshMap.length) {
                throw new Error(`Unexpected iterator position for submeshMap; expected ${submeshMap.length}, got ${js}`);
            }

            return [submeshMap, mesh];
        } else {
            return [null, mesh];
        }
    }

    /**
     * Make an indexData buffer for the creation of a WL.Mesh instance.
     * Automatically decides the most memory-efficient TypedArray for the
     * buffer.
     *
     * @param size - The ammount of indices in the indexData buffer.
     * @param vertexCount - The amount of vertices that will be indexed.
     * @returns A tuple containing the indexData buffer, and the indexType argument to be passed to the WL.Mesh constructor.
     */
    static makeIndexBuffer(size: number, vertexCount: number): [indexData: Uint8Array, indexType: WL.MeshIndexType] | [indexData: Uint16Array, indexType: WL.MeshIndexType] | [indexData: Uint32Array, indexType: WL.MeshIndexType] {
        const vertexCountM1 = vertexCount - 1;

        if (vertexCountM1 <= 0xFF) {
            return [new Uint8Array(size), WL.MeshIndexType.UnsignedByte];
        } else if (vertexCountM1 <= 0xFFFF) {
            return [new Uint16Array(size), WL.MeshIndexType.UnsignedShort];
        } else if (vertexCountM1 <= MAX_INDEX) {
            return [new Uint32Array(size), WL.MeshIndexType.UnsignedInt];
        } else {
            throw new Error(`Maximum index exceeded (${MAX_INDEX})`);
        }
    }

    /**
     * Make a buffer for storing submesh map data. Automatically decides the
     * most memory-efficient TypedArray for the buffer.
     *
     * @param triCount - The ammount of triangle that will be mapped.
     * @param maxSubmeshTriCount - The biggest amount of triangles in the submeshes.
     * @param maxSubmeshIdx - The biggest submesh index.
     * @returns A new buffer for storing submesh map data.
     */
    static makeSubmeshMapBuffer(triCount: number, maxSubmeshTriCount: number, maxSubmeshIdx: number): SubmeshMap {
        const maxNum = Math.max(maxSubmeshTriCount - 1, maxSubmeshIdx);
        if (maxNum <= 0xFF) {
            return new Uint8Array(triCount * 2);
        } else if (maxNum <= 0xFFFF) {
            return new Uint16Array(triCount * 2);
        } else if (maxNum <= MAX_INDEX) {
            return new Uint32Array(triCount * 2);
        } else {
            throw new Error(`Maximum index exceeded (${MAX_INDEX})`);
        }
    }

    /**
     * Destroy the Wonderland Engine meshes stored in this object. Note that if
     * the submeshes are reused elsewhere, then this will destroy those too.
     */
    dispose(): void {
        for (const [mesh, _material] of this.submeshes) {
            mesh.destroy();
        }

        this.submeshes.splice(0, this.submeshes.length);
        this.premadeManifoldMesh = null;
        this.submeshMap = null;
    }

    /**
     * Sets {@link MeshGroup#autoDispose} to true (marks as auto-disposable).
     * Chainable method.
     */
    mark(): this {
        this.autoDispose = true;
        return this;
    }

    /**
     * Transform all submeshes and the manifold by a given matrix and normal
     * matrix. Chainable method.
     */
    transform(matrix: mat4, normalMatrix?: mat3): this {
        if (!normalMatrix) {
            normalMatrix = mat3.fromMat4(mat3.create(), matrix);
        }

        const tmp3 = vec3.create();
        const tmp4 = vec4.create();

        // transform submeshes
        for (const [submesh, _material] of this.submeshes) {
            const vertexCount = submesh.vertexCount;

            const positions = submesh.attribute(WL.MeshAttribute.Position);
            if (!positions) {
                throw new Error('Could not get positions MeshAttributeAccessor');
            }

            const normals = submesh.attribute(WL.MeshAttribute.Normal);
            const tangents = submesh.attribute(WL.MeshAttribute.Tangent);

            for (let i = 0; i < vertexCount; i++) {
                positions.get(i, tmp3)
                vec3.transformMat4(tmp3, tmp3, matrix);
                positions.set(i, tmp3);

                if (normals) {
                    normals.get(i, tmp3)
                    vec3.transformMat3(tmp3, tmp3, normalMatrix);
                    normals.set(i, tmp3);
                }

                if (tangents) {
                    tangents.get(i, tmp4)
                    vec3.transformMat3(tmp4 as vec3, tmp4 as vec3, normalMatrix);
                    tangents.set(i, tmp4);
                }
            }
        }

        // transform premade manifold
        if (this.premadeManifoldMesh) {
            const vertPos = this.premadeManifoldMesh.vertPos;
            const vertexCount = vertPos.length;

            for (let i = 0; i < vertexCount;) {
                const iStart = i;
                tmp3[0] = vertPos[i++];
                tmp3[1] = vertPos[i++];
                tmp3[2] = vertPos[i++];

                vec3.transformMat4(tmp3, tmp3, matrix);

                vertPos[iStart] = tmp3[0];
                vertPos[iStart + 1] = tmp3[1];
                vertPos[iStart + 2] = tmp3[2];
            }
        }

        return this;
    }

    /**
     * Translate all submeshes and the manifold by a given translation vector.
     * Chainable method.
     */
    translate(translation: vec3): this {
        this.transform(mat4.fromTranslation(mat4.create(), translation));
        return this;
    }

    /**
     * Scale all submeshes and the manifold by a given per-axis factor.
     * Chainable method.
     */
    scale(factor: vec3): this {
        this.transform(mat4.fromScaling(mat4.create(), factor));
        return this;
    }

    /**
     * Scale all submeshes and the manifold by a single factor. Chainable
     * method.
     */
    uniformScale(factor: number): this {
        this.transform(mat4.fromScaling(mat4.create(), vec3.fromValues(factor, factor, factor)));
        return this;
    }

    /**
     * Rotate all submeshes and the manifold by a given quaternion. Chainable
     * method.
     */
    rotate(rotation: quat): this {
        this.transform(mat4.fromQuat(mat4.create(), rotation));
        return this;
    }
}