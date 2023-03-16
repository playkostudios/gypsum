import { mat3, mat4, vec3, vec4 } from 'gl-matrix';
import { getComponentCount } from '../common/getComponentCount';
import { mergeMapFromWLE } from './mesh-gen/merge-map-from-wle';
import { MeshIndexType, MeshAttribute, Mesh } from '@wonderlandengine/api';
import { getHintAttribute } from './mesh-gen/get-hint-attribute';
import { newShim_Mesh } from '../common/backport-shim';

import type { quat } from 'gl-matrix';
import type { EncodedMeshGroup } from '../common/EncodedMeshGroup';
import type { AllowedExtraMeshAttribute } from '../common/AllowedExtraMeshAttribute';
import type { EncodedSubmesh } from '../common/EncodedSubmesh';
import type { MeshAttributeAccessor } from '@wonderlandengine/api';
import type { MergeMap } from '../common/MergeMap';
import type { Material } from '@wonderlandengine/api';
import type { WonderlandEngine } from '../common/backport-shim';
import type { PatchedMeshAttributeAccessor } from './misc/PatchedMeshAttributeAccessor';
import type { Hint } from '../common/Hint';

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
 * A pair containing a WL.Mesh instance, its assigned WL.Material and an
 * optional list of extra mesh attribute hints.
 *
 * The extra mesh attributes list defines the list of attributes that need to be
 * handled. If none is passed, then all mesh attributes will be handled,
 * including mesh attributes that are potentially not used, since the available
 * attributes are dictated by the existing pipelines, not by each mesh.
 */
export type Submesh = [mesh: Mesh, material: Material | null, extraAttributesHint?: Hint];

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
     * @param premadeMergeMap - A merge map that defines how to create a manifold from the submeshes.
     */
    constructor(protected submeshes: Array<Submesh> = [], protected premadeMergeMap: MergeMap | null = null) {}

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
    static fromWLEMesh(mesh: Mesh, material: Material | null = null) {
        return new MeshGroup([[ mesh, material ]]);
    }

    /** Create a new MeshGroup from an EncodedMeshGroup. */
    static fromEncodedMeshGroup(engine: WonderlandEngine, encodedMeshGroup: EncodedMeshGroup, materials: Array<Material>): MeshGroup {
        // decode submeshes
        const submeshes = new Array<Submesh>();
        try {
            for (const encSubmesh of encodedMeshGroup.submeshes) {
                // get mapped submesh material
                const materialID = encSubmesh.materialID;
                let material: Material | null = null;

                if (materialID !== null) {
                    material = materials[materialID];
                    if (material === undefined) {
                        throw new Error(`Material ID ${materialID} is not mapped`);
                    }
                }

                // get index buffer
                let indexType: MeshIndexType | undefined;
                let indexData: Uint8Array | Uint16Array | Uint32Array | undefined;
                const vertexCount = encSubmesh.positions.length / 3;

                if (vertexCount === 0) {
                    console.warn('Skipped empty submesh');
                    continue;
                }

                if (encSubmesh.indices) {
                    indexData = encSubmesh.indices;
                    const elemBytes = indexData.BYTES_PER_ELEMENT;

                    if (elemBytes === 1) {
                        indexType = MeshIndexType.UnsignedByte;
                    } else if (elemBytes === 2) {
                        indexType = MeshIndexType.UnsignedShort;
                    } else if (elemBytes === 4) {
                        indexType = MeshIndexType.UnsignedInt;
                    } else {
                        throw new Error(`Unexpected ${elemBytes * 8}-bit encoded submesh indices`);
                    }
                }

                // make mesh
                const mesh = newShim_Mesh(engine, {
                    indexData, indexType, vertexCount
                });
                submeshes.push([ mesh, material ]);

                // add mesh attributes
                const attrs: Array<[MeshAttribute, Float32Array]> = [
                    [MeshAttribute.Position, encSubmesh.positions],
                    ...encSubmesh.extraAttributes
                ];

                for (const [attrType, buffer] of attrs) {
                    const accessor = mesh.attribute(attrType);
                    if (accessor === null) {
                        throw new Error(`Unexpected missing mesh attribute accessor with ID ${attrType}`);
                    }

                    accessor.set(0, buffer);
                }
            }
        } catch(err) {
            for (const [mesh, _material] of submeshes) {
                mesh.destroy();
            }

            throw err;
        }

        // pass everything else through
        return new MeshGroup(submeshes, encodedMeshGroup.mergeMap);
    }

    /**
     * Create a new empty MeshGroup. Useless on its own, only ever appears as a
     * fallback for CSG operations with no result.
     */
    static makeEmpty() {
        return new MeshGroup(
            [],
            [new Uint32Array(), new Uint32Array()],
        );
    }

    /**
     * Get the merge map of this MeshGroup. If the MeshGroup has no merge map
     * yet, then a merge map will be automatically generated and cached. Note
     * that this process can throw.
     */
    get mergeMap(): MergeMap {
        if (!this.premadeMergeMap) {
            const submeshCount = this.submeshes.length;
            const wleMeshes = new Array<Mesh>(submeshCount);
            const hints = new Array<Hint | undefined>(submeshCount);

            let i = 0;
            for (const [wleMesh, _material, hint] of this.submeshes) {
                wleMeshes[i] = wleMesh;
                hints[i++] = hint;
            }

            this.premadeMergeMap = mergeMapFromWLE(wleMeshes, hints);
        }

        return this.premadeMergeMap;
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
     * Destroy the Wonderland Engine meshes stored in this object. Note that if
     * the submeshes are reused elsewhere, then this will destroy those too.
     */
    dispose(): void {
        for (const [mesh, _material] of this.submeshes) {
            mesh.destroy();
        }

        this.submeshes.splice(0, this.submeshes.length);
        this.premadeMergeMap = null;
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

            const positions = submesh.attribute(MeshAttribute.Position);
            if (!positions) {
                throw new Error('Could not get positions MeshAttributeAccessor');
            }

            const normals = submesh.attribute(MeshAttribute.Normal);
            const tangents = submesh.attribute(MeshAttribute.Tangent);

            for (let i = 0; i < vertexCount; i++) {
                // TODO remove cast once WLE types are fixed
                (positions as PatchedMeshAttributeAccessor<Float32Array>).get(i, tmp3);
                vec3.transformMat4(tmp3, tmp3, matrix);
                positions.set(i, tmp3);

                if (normals) {
                    // TODO remove cast once WLE types are fixed
                    (normals as PatchedMeshAttributeAccessor<Float32Array>).get(i, tmp3);
                    vec3.transformMat3(tmp3, tmp3, normalMatrix);
                    normals.set(i, tmp3);
                }

                if (tangents) {
                    // TODO remove cast once WLE types are fixed
                    (tangents as PatchedMeshAttributeAccessor<Float32Array>).get(i, tmp4);
                    vec3.transformMat3(tmp4 as vec3, tmp4 as vec3, normalMatrix);
                    tangents.set(i, tmp4);
                }
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

    /**
     * Encode into a format that is passable to the Manifold worker, along with
     * a numeric mapping for materials.
     *
     * @param materials: A list of materials. Materials will be converted to indices from this array.
     * @param transferables: An array to push transferables to, so that typed arrays can be transfered to a worker.
     */
    encode(materials: Array<Material>, transferables: Array<Transferable>): EncodedMeshGroup {
        // get merge map
        const mergeMap = this.mergeMap;

        // clone merge map buffers
        const mergeFromBuf = new ArrayBuffer(mergeMap[0].byteLength);
        const mergeFrom = new Uint32Array(mergeFromBuf);
        mergeFrom.set(mergeMap[0]);
        transferables.push(mergeFromBuf);

        const mergeToBuf = new ArrayBuffer(mergeMap[1].byteLength);
        const mergeTo = new Uint32Array(mergeToBuf);
        mergeTo.set(mergeMap[1]);
        transferables.push(mergeToBuf);

        // clone submeshes
        const submeshes = new Array<EncodedSubmesh>();
        for (const submesh of this.submeshes) {
            // get material ID
            let materialID: number | null = null;
            const material = submesh[1];
            if (material !== null) {
                materialID = materials.indexOf(material);

                if (materialID === -1) {
                    materialID = materials.length;
                    materials.push(material);
                }
            }

            // get indices for mesh (if mesh is indexed)
            const mesh = submesh[0];
            const indexData = mesh.indexData;
            let indices: Uint32Array | null = null;

            if (indexData !== null) {
                indices = new Uint32Array(indexData.length);
                indices.set(indexData);
                transferables.push(indices.buffer);
            }

            // get positions for mesh
            const origPositions = mesh.attribute(MeshAttribute.Position);
            if (origPositions === null) {
                throw new Error('Unexpected missing positions mesh attribute');
            }

            const vertexCount = mesh.vertexCount;
            const positions = new Float32Array(vertexCount * 3);
            // TODO remove cast once WLE types are fixed
            (origPositions as PatchedMeshAttributeAccessor<Float32Array>).get(0, positions);
            transferables.push(positions.buffer);

            // get which extra attributes need to be copied, or generate the
            // list of attributes if no hints are provided
            const attrs = new Array<[type: AllowedExtraMeshAttribute, accessor: MeshAttributeAccessor, componentCount: number]>();
            let hints: Iterable<AllowedExtraMeshAttribute> | undefined = submesh[2];
            let failOnMissing = true;

            if (hints === undefined) {
                failOnMissing = false;
                hints = [MeshAttribute.Tangent, MeshAttribute.Normal, MeshAttribute.TextureCoordinate, MeshAttribute.Color];
            }

            for (const attrType of hints) {
                const componentCount = getComponentCount(attrType);
                const accessor = getHintAttribute(mesh, attrType, failOnMissing);
                if (!accessor) {
                    continue;
                }

                attrs.push([attrType, accessor, componentCount]);
            }

            // get extra attributes
            const extraAttributes = new Array<[AllowedExtraMeshAttribute, Float32Array]>();
            for (const [attrType, attrAccessor, componentCount] of attrs) {
                const attrArray = new Float32Array(vertexCount * componentCount);
                // TODO remove cast once WLE types are fixed
                (attrAccessor as PatchedMeshAttributeAccessor<Float32Array>).get(0, attrArray);
                extraAttributes.push([attrType, attrArray]);
                transferables.push(attrArray.buffer);
            }

            // convert to object
            submeshes.push({ indices, positions, extraAttributes, materialID });
        }

        // make encoded meshgroup object
        return { mergeMap: [mergeFrom, mergeTo], submeshes };
    }
}