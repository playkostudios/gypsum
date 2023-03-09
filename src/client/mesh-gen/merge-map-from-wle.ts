import { deinterlaceMergeMap } from './deinterlace-merge-map';
import { genInterlacedMergeMap, IndexRangeList } from './gen-interlaced-merge-map';
import { MeshAttribute } from '@wonderlandengine/api';
import { Triangle } from './Triangle';
import { DynamicArray } from '../../common/DynamicArray';

import type { AllowedExtraMeshAttribute } from '../../common/AllowedExtraMeshAttribute';
import type { Mesh, MeshAttributeAccessor } from '@wonderlandengine/api';
import type { MergeMap } from '../../common/MergeMap';

/**
 * Automatically create a manifold from given Wonderland Engine meshes. Note
 * that this method has issues with singularities and edges shared by more
 * than 2 triangles, since this is a vertex distance method instead of
 * better methods such as cutting and stitching.
 *
 * @param wleMeshes - A Wonderland Engine mesh, or a list of Wonderland Engine meshes, to convert to a manifold
 * @returns Returns a tuple containing the submesh map, and a manifold. If genSubmeshMap is false, then the submesh map will be null.
 */
export function mergeMapFromWLE(wleMeshes: Mesh | Array<Mesh>, hints?: Array<Set<AllowedExtraMeshAttribute> | undefined>): MergeMap {
    // make sure input is an array
    if (!Array.isArray(wleMeshes)) {
        wleMeshes = [wleMeshes];
    }

    const meshCount = wleMeshes.length;

    // populate hints
    if (!hints) {
        hints = new Array(meshCount);
        hints.fill(undefined);
    }

    // convert meshes to triangles, and map triangles to original indices
    const triangles = new Array<Triangle>();
    const indexRangeList: IndexRangeList = [];
    let vertexCount = 0;
    let indexOffset = 0;
    for (let m = 0; m < meshCount; m++) {
        // get positions attr
        const mesh = wleMeshes[m];
        const positions = mesh.attribute(MeshAttribute.Position);
        if (!positions) {
            throw new Error('Unexpected missing positions mesh attribute');
        }

        // get other attrs according to hints
        let normals: MeshAttributeAccessor | null;
        let uvs: MeshAttributeAccessor | null;
        let tangents: MeshAttributeAccessor | null;

        const hint = hints[m];
        if (hint) {
            if (hint.has(MeshAttribute.Normal)) {
                normals = mesh.attribute(MeshAttribute.Normal);
                // TODO should we throw if null?
            } else {
                normals = null;
            }

            if (hint.has(MeshAttribute.TextureCoordinate)) {
                uvs = mesh.attribute(MeshAttribute.TextureCoordinate);
                // TODO should we throw if null?
            } else {
                uvs = null;
            }

            if (hint.has(MeshAttribute.Tangent)) {
                tangents = mesh.attribute(MeshAttribute.Tangent);
                // TODO should we throw if null?
            } else {
                tangents = null;
            }
        } else {
            normals = mesh.attribute(MeshAttribute.Normal);
            uvs = mesh.attribute(MeshAttribute.TextureCoordinate);
            tangents = mesh.attribute(MeshAttribute.Tangent);
        }

        // iterate indices (or vertices if not indexed), convert to triangles
        // and build index range list
        const indexStart = indexOffset;
        const indexData = mesh.indexData;
        let indexCount: number;

        if (indexData) {
            indexCount = indexData.length;
            for (let i = 0; i < indexCount;) {
                triangles.push(Triangle.fromMeshData(
                    indexData[i++], indexData[i++], indexData[i++],
                    positions, normals, uvs, tangents
                ));
            }
        } else {
            indexCount = mesh.vertexCount;
            for (let i = 0; i < indexCount;) {
                triangles.push(Triangle.fromMeshData(
                    i++, i++, i++, positions, normals, uvs, tangents
                ));
            }
        }

        indexOffset += indexCount;
        indexRangeList.push([vertexCount, indexStart, indexOffset, indexData]);

        // count vertices
        vertexCount += mesh.vertexCount;
    }

    // merge vertices. the triangles were generated in order, so no
    // triangle->index map needs to be generated
    const interlacedMergeMap = new DynamicArray(Uint32Array);
    genInterlacedMergeMap(triangles, vertexCount, indexRangeList, null, interlacedMergeMap);
    return deinterlaceMergeMap(interlacedMergeMap);
}