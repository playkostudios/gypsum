// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { vec3 } from 'gl-matrix';
import VertexHasher from './VertexHasher';

const MAX_INDEX_BUFFER_SIZE = 4294967296;

let baseClass: typeof WL.Mesh;
if (WL && WL.Mesh) {
    baseClass = WL.Mesh;
} else {
    baseClass = (class {
        constructor(objArgs) {
            console.warn('WL.Mesh constructor arguments:', objArgs);
            throw new Error('Attempt to use dummy WL.Mesh');
        }
    }) as typeof WL.Mesh;
}

const temp0 = vec3.create();
const temp1 = vec3.create();

class ManifoldWLMesh extends baseClass {
    constructor(vertexCount: number, indexData: ArrayLike<number>, indexType: WL.MeshIndexType, public premadeManifoldMesh?: Mesh) {
        super({ vertexCount, indexData, indexType });
    }

    get manifoldMesh(): Mesh {
        if (!this.premadeManifoldMesh) {
            this.premadeManifoldMesh = ManifoldWLMesh.manifoldFromWLE(this);
        }

        return this.premadeManifoldMesh;
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
                    // calculate triangle plane normal
                    vec3.sub(temp0, bPos, aPos); // BA
                    vec3.sub(temp1, bPos, cPos); // BC
                    vec3.cross(temp0, temp1, temp0); // normal

                    normals.set(j, temp0);
                    normals.set(j + 1, temp0);
                    normals.set(j + 2, temp0);
                }
            }

            positions.set(j++, aPos);
            positions.set(j++, bPos);
            positions.set(j++, cPos);
        }

        return wleMesh;
    }

    static manifoldFromWLE(wleMesh: WL.Mesh): Mesh {
        // try to make manifold from mesh. this will fail if there are
        // disconnected faces that have edges with the same position (despite
        // being different edges)
        // validate vertex count
        const indexData = wleMesh.indexData;
        const packedVertexCount = wleMesh.vertexCount;
        const vertexCount = indexData === null ? packedVertexCount : indexData.length;

        if (vertexCount % 3 !== 0) {
            throw new Error(`Mesh has an invalid vertex count (${vertexCount}). Must be a multiple of 3`);
        }

        // prepare accessors
        const positions = wleMesh.attribute(WL.MeshAttribute.Position);
        const triCount = vertexCount / 3;
        const mesh = {
            vertPos: new Array<Vec3>(),
            triVerts: new Array<Vec3>(triCount)
        }

        // convert positions
        const hasher = new VertexHasher();
        const mergedIndices = new Array<number>();
        let nextIdx = 0;
        for (let i = 0; i < packedVertexCount; i++) {
            const pos = positions.get(i);

            if (hasher.isUnique(pos)) {
                mesh.vertPos.push(pos);
                mergedIndices.push(nextIdx++);
            } else {
                const [x, y, z] = pos;
                let j = 0;
                for (; j < mesh.vertPos.length; j++) {
                    const [ox, oy, oz] = mesh.vertPos[j];
                    if (ox === x && oy === y && oz === z) {
                        break;
                    }
                }

                if (j === mesh.vertPos.length) {
                    mesh.vertPos.push(pos);
                    mergedIndices.push(nextIdx++);
                } else {
                    mergedIndices.push(j);
                }
            }
        }

        // make triangles
        let j = 0;
        if (indexData === null) {
            for (let i = 0; i < vertexCount; i += 3) {
                mesh.triVerts[j++] = [
                    mergedIndices[i], mergedIndices[i + 1], mergedIndices[i + 2]
                ];
            }
        } else {
            for (let i = 0; i < vertexCount; i += 3) {
                mesh.triVerts[j++] = [
                    mergedIndices[indexData[i]],
                    mergedIndices[indexData[i + 1]],
                    mergedIndices[indexData[i + 2]]
                ];
            }
        }

        return mesh;
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

export { ManifoldWLMesh };