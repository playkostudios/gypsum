import { ManifoldBuilder } from './ManifoldBuilder';
import { vec2, vec3 } from 'gl-matrix';

const ICO_V: Array<Readonly<vec3>> = [
    vec3.fromValues( 0       ,  1       ,  0      ),
    vec3.fromValues( 0.276385,  0.447215, -0.85064),
    vec3.fromValues(-0.7236  ,  0.447215, -0.52572),
    vec3.fromValues(-0.7236  ,  0.447215,  0.52572),
    vec3.fromValues( 0.276385,  0.447215,  0.85064),
    vec3.fromValues( 0.894425,  0.447215,  0      ),
    vec3.fromValues(-0.276385, -0.447215, -0.85064),
    vec3.fromValues(-0.894425, -0.447215,  0      ),
    vec3.fromValues(-0.276385, -0.447215,  0.85064),
    vec3.fromValues( 0.7236  , -0.447215,  0.52572),
    vec3.fromValues( 0.7236  , -0.447215, -0.52572),
    vec3.fromValues( 0       , -1       ,  0      ),
];

const TL_UV: Readonly<vec2> = vec2.fromValues(0, 1);
const TM_UV: Readonly<vec2> = vec2.fromValues(0.5, 1);
const TR_UV: Readonly<vec2> = vec2.fromValues(1, 1);
const BL_UV: Readonly<vec2> = vec2.fromValues(0, 0);
const BM_UV: Readonly<vec2> = vec2.fromValues(0.5, 0);
const BR_UV: Readonly<vec2> = vec2.fromValues(1, 0);

export function makeIcosahedronBuilder(): ManifoldBuilder {
    const builder = new ManifoldBuilder();

    // top triangles
    builder.addTriangle(ICO_V[0 ], ICO_V[1 ], ICO_V[2 ], TM_UV, BL_UV, BR_UV);
    builder.addTriangle(ICO_V[0 ], ICO_V[2 ], ICO_V[3 ], TM_UV, BL_UV, BR_UV);
    builder.addTriangle(ICO_V[0 ], ICO_V[3 ], ICO_V[4 ], TM_UV, BL_UV, BR_UV);
    builder.addTriangle(ICO_V[0 ], ICO_V[4 ], ICO_V[5 ], TM_UV, BL_UV, BR_UV);
    builder.addTriangle(ICO_V[0 ], ICO_V[5 ], ICO_V[1 ], TM_UV, BL_UV, BR_UV);

    // side triangles
    builder.addTriangle(ICO_V[1 ], ICO_V[6 ], ICO_V[2 ], TL_UV, BM_UV, TR_UV);
    builder.addTriangle(ICO_V[2 ], ICO_V[6 ], ICO_V[7 ], TM_UV, BL_UV, BR_UV);
    builder.addTriangle(ICO_V[2 ], ICO_V[7 ], ICO_V[3 ], TL_UV, BM_UV, TR_UV);
    builder.addTriangle(ICO_V[3 ], ICO_V[7 ], ICO_V[8 ], TM_UV, BL_UV, BR_UV);
    builder.addTriangle(ICO_V[3 ], ICO_V[8 ], ICO_V[4 ], TL_UV, BM_UV, TR_UV);
    builder.addTriangle(ICO_V[4 ], ICO_V[8 ], ICO_V[9 ], TM_UV, BL_UV, BR_UV);
    builder.addTriangle(ICO_V[4 ], ICO_V[9 ], ICO_V[5 ], TL_UV, BM_UV, TR_UV);
    builder.addTriangle(ICO_V[5 ], ICO_V[9 ], ICO_V[10], TM_UV, BL_UV, BR_UV);
    builder.addTriangle(ICO_V[5 ], ICO_V[10], ICO_V[1 ], TL_UV, BM_UV, TR_UV);
    builder.addTriangle(ICO_V[1 ], ICO_V[10], ICO_V[6 ], TM_UV, BL_UV, BR_UV);

    // bottom triangles
    builder.addTriangle(ICO_V[11], ICO_V[7 ], ICO_V[6 ], BM_UV, TR_UV, TL_UV);
    builder.addTriangle(ICO_V[11], ICO_V[8 ], ICO_V[7 ], BM_UV, TR_UV, TL_UV);
    builder.addTriangle(ICO_V[11], ICO_V[9 ], ICO_V[8 ], BM_UV, TR_UV, TL_UV);
    builder.addTriangle(ICO_V[11], ICO_V[10], ICO_V[9 ], BM_UV, TR_UV, TL_UV);
    builder.addTriangle(ICO_V[11], ICO_V[6 ], ICO_V[10], BM_UV, TR_UV, TL_UV);

    builder.autoConnectEdges();

    return builder;
}