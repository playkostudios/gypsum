import { SmoothNormalsOptions } from './SmoothNormalsOptions';

export interface PrismPyramidOptions extends SmoothNormalsOptions {
    height?: number;
    baseScale?: number;
    baseMaterial?: WL.Material;
    sideMaterial?: WL.Material;
}