import type { MeshAttribute } from '@wonderlandengine/api';

/** Extra (non-position) mesh attributes that are supported by Gypsum. */
export type AllowedExtraMeshAttribute = MeshAttribute.Tangent | MeshAttribute.Normal | MeshAttribute.TextureCoordinate | MeshAttribute.Color;
