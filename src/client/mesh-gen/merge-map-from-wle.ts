import { deinterlaceMergeMap } from './deinterlace-merge-map';
import { genInterlacedMergeMap, IndexRangeList } from './gen-interlaced-merge-map';
import { MeshAttribute } from '@wonderlandengine/api';
import { Triangle } from './Triangle';
import { DynamicArray } from '../../common/DynamicArray';
import { getHintAttributeFromSet } from './get-hint-attribute';
import { autoConnectAllEdges } from './auto-connect-all-edges';

import type { Hint } from '../../common/Hint';
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
export function mergeMapFromWLE(wleMeshes: Mesh | Array<Mesh>, hints?: Array<Hint | undefined>): MergeMap {
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
        let normals: MeshAttributeAccessor<Float32ArrayConstructor> | null;
        let uvs: MeshAttributeAccessor<Float32ArrayConstructor> | null;
        let tangents: MeshAttributeAccessor<Float32ArrayConstructor> | null;
        let colors: MeshAttributeAccessor<Float32ArrayConstructor> | null;

        const hint = hints[m];
        if (hint) {
            normals = getHintAttributeFromSet(mesh, hint, MeshAttribute.Normal);
            uvs = getHintAttributeFromSet(mesh, hint, MeshAttribute.TextureCoordinate);
            tangents = getHintAttributeFromSet(mesh, hint, MeshAttribute.Tangent);
            colors = getHintAttributeFromSet(mesh, hint, MeshAttribute.Color);
        } else {
            normals = mesh.attribute(MeshAttribute.Normal);
            uvs = mesh.attribute(MeshAttribute.TextureCoordinate);
            tangents = mesh.attribute(MeshAttribute.Tangent);
            colors = mesh.attribute(MeshAttribute.Color);
        }

        // iterate indices (or vertices if not indexed), convert to triangles
        // and build index range list
        const indexStart = indexOffset;
        const indexData = mesh.indexData;
        let indexCount: number;

        if (indexData) {
            indexCount = indexData.length;
            for (let i = 0; i < indexCount;) {
                const triangle = Triangle.fromMeshData(
                    indexData[i++], indexData[i++], indexData[i++],
                    positions, normals, uvs, tangents, colors
                );
                triangle.helper = triangles.length;
                triangles.push(triangle);
            }
        } else {
            indexCount = mesh.vertexCount;
            for (let i = 0; i < indexCount;) {
                const triangle = Triangle.fromMeshData(
                    i++, i++, i++, positions, normals, uvs, tangents, colors
                );
                triangle.helper = triangles.length;
                triangles.push(triangle);
            }
        }

        indexOffset += indexCount;
        indexRangeList.push([vertexCount, indexStart, indexOffset, indexData]);

        // count vertices
        vertexCount += mesh.vertexCount;
    }

    // auto-connect triangles
    autoConnectAllEdges(triangles);

    // merge vertices. the triangles were generated in order, so no
    // triangle->index map needs to be generated
    const interlacedMergeMap = new DynamicArray(Uint32Array);
    genInterlacedMergeMap(triangles, vertexCount, indexRangeList, null, interlacedMergeMap);
    return deinterlaceMergeMap(interlacedMergeMap);
}