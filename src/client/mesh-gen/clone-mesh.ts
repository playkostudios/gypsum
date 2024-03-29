import { makeIndexBuffer } from '../../client';
import { Mesh, MeshAttribute } from '@wonderlandengine/api';

import type { MeshIndexType, WonderlandEngine } from '@wonderlandengine/api';

/**
 * Clone a Wonderland Engine mesh. A new, separate mesh will be created with the
 * same data as the given mesh. Useful if you want to transform a mesh without
 * modifying the original mesh.
 *
 * Note that skinning data is not cloned.
 *
 * @param oMesh - The original mesh to copy.
 * @param engine - The Wonderland Engine instance to use for creating the mesh
 * @returns Returns a copy of the given mesh.
 */
export function cloneMesh(oMesh: Mesh, engine: WonderlandEngine): Mesh {
    // clone index data
    const oIndexData = oMesh.indexData;
    const vertexCount = oMesh.vertexCount;
    const indexCount = oIndexData === null ? vertexCount : oIndexData.length;
    let indexData: Uint8Array | Uint16Array | Uint32Array | undefined;
    let indexType: MeshIndexType | undefined;

    if (oIndexData) {
        [indexData, indexType] = makeIndexBuffer(indexCount, vertexCount);

        for (let i = 0; i < indexCount; i++) {
            indexData[i] = oIndexData[i];
        }
    }

    // make new mesh
    const mesh = new Mesh(engine, { indexData, indexType, vertexCount });

    // clone vertex attributes
    // (positions)
    const positions = mesh.attribute(MeshAttribute.Position);
    if (!positions) {
        throw new Error('Could not get position mesh attribute accessor');
    }

    const oPositions = oMesh.attribute(MeshAttribute.Position);
    if (!oPositions) {
        throw new Error('Could not get position mesh attribute accessor');
    }

    const posBuf = new Float32Array(vertexCount * 3);
    oPositions.get(0, posBuf);
    positions.set(0, posBuf);

    // (normals)
    const normals = mesh.attribute(MeshAttribute.Normal);
    if (normals) {
        const oNormals = oMesh.attribute(MeshAttribute.Normal);
        if (oNormals) {
            const normBuf = new Float32Array(vertexCount * 3);
            oNormals.get(0, normBuf);
            normals.set(0, normBuf);
        }
    }

    // (tangents)
    const tangents = mesh.attribute(MeshAttribute.Tangent);
    if (tangents) {
        const oTangents = oMesh.attribute(MeshAttribute.Tangent);
        if (oTangents) {
            const tanBuf = new Float32Array(vertexCount * 4);
            oTangents.get(0, tanBuf);
            tangents.set(0, tanBuf);
        }
    }

    // (tex coords)
    const uvs = mesh.attribute(MeshAttribute.TextureCoordinate);
    if (uvs) {
        const oUVs = oMesh.attribute(MeshAttribute.TextureCoordinate);
        if (oUVs) {
            const uvBuf = new Float32Array(vertexCount * 2);
            oUVs.get(0, uvBuf);
            uvs.set(0, uvBuf);
        }
    }

    // (colors)
    const colors = mesh.attribute(MeshAttribute.Color);
    if (colors) {
        const oColors = oMesh.attribute(MeshAttribute.Color);
        if (oColors) {
            const colorBuf = new Float32Array(vertexCount * 2);
            oColors.get(0, colorBuf);
            colors.set(0, colorBuf);
        }
    }

    return mesh;
}