import type { EncodedSubmesh } from './EncodedSubmesh';

export interface EncodedMeshGroup {
    mergeMap: [from: Uint32Array, to: Uint32Array] | null;
    submeshes: Array<EncodedSubmesh>;
}