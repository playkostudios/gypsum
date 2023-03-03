import type { EncodedSubmesh } from './EncodedSubmesh';
import type { MergeMap } from './MergeMap';

export interface EncodedMeshGroup {
    mergeMap: MergeMap | null;
    submeshes: Array<EncodedSubmesh>;
}
