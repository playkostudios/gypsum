import { SmoothNormalsOptions } from './SmoothNormalsOptions';

import type { Material } from '@wonderlandengine/api';

/** Optional arguments for prism/pyramid generation. */
export interface PrismPyramidOptions extends SmoothNormalsOptions {
    /** The height of the prism/pyramid. */
    height?: number;
    /** The scale of the base. */
    baseScale?: number;
    /** The material to use for the bases. */
    baseMaterial?: Material;
    /** The material to use for the sides. */
    sideMaterial?: Material;
}