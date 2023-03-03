import type { AllowedExtraMeshAttributes } from './AllowedExtraMeshAttributes';

export interface EncodedSubmesh {
    indices: Uint8Array | Uint16Array | Uint32Array | null;
    positions: Float32Array;
    extraAttributes: Array<[AllowedExtraMeshAttributes, Float32Array]>;
    materialID: number | null;
}