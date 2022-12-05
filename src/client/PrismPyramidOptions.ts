import { SmoothNormalsOptions } from './SmoothNormalsOptions';

/** Optional arguments for prism/pyramid generation. */
export interface PrismPyramidOptions extends SmoothNormalsOptions {
    /** The height of the prism/pyramid. */
    height?: number;
    /** The scale of the base. */
    baseScale?: number;
    /** The material to use for the bases. */
    baseMaterial?: WL.Material;
    /** The material to use for the sides. */
    sideMaterial?: WL.Material;
}