import type { SubmeshMap } from '../client/MeshGroup';
import type { EncodedSubmesh } from './EncodedSubmesh';
import type { EncodedManifoldMesh } from './EncodedManifoldMesh';

export interface EncodedMeshGroup {
    manifoldMesh: EncodedManifoldMesh;
    submeshes: Array<EncodedSubmesh>;
    submeshMap: SubmeshMap;
}