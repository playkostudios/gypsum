import { SubmeshMap } from '../client/MeshGroup';
import { EncodedSubmesh } from './EncodedSubmesh';
import { StrippedMesh } from './StrippedMesh';

export interface EncodedMeshGroup {
    manifoldMesh: StrippedMesh;
    submeshes: Array<EncodedSubmesh>;
    submeshMap: SubmeshMap;
}