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

export function makeIcosahedronBuilder(addTangents = true): ManifoldBuilder {
    const builder = new ManifoldBuilder();

    // top triangles
    const t0  = builder.addTriangle(ICO_V[0 ], ICO_V[1 ], ICO_V[2 ], TM_UV, BL_UV, BR_UV);
    const t1  = builder.addTriangle(ICO_V[0 ], ICO_V[2 ], ICO_V[3 ], TM_UV, BL_UV, BR_UV);
    const t2  = builder.addTriangle(ICO_V[0 ], ICO_V[3 ], ICO_V[4 ], TM_UV, BL_UV, BR_UV);
    const t3  = builder.addTriangle(ICO_V[0 ], ICO_V[4 ], ICO_V[5 ], TM_UV, BL_UV, BR_UV);
    const t4  = builder.addTriangle(ICO_V[0 ], ICO_V[5 ], ICO_V[1 ], TM_UV, BL_UV, BR_UV);

    // side triangles
    const t5  = builder.addTriangle(ICO_V[1 ], ICO_V[6 ], ICO_V[2 ], TL_UV, BM_UV, TR_UV);
    const t6  = builder.addTriangle(ICO_V[2 ], ICO_V[6 ], ICO_V[7 ], TM_UV, BL_UV, BR_UV);
    const t7  = builder.addTriangle(ICO_V[2 ], ICO_V[7 ], ICO_V[3 ], TL_UV, BM_UV, TR_UV);
    const t8  = builder.addTriangle(ICO_V[3 ], ICO_V[7 ], ICO_V[8 ], TM_UV, BL_UV, BR_UV);
    const t9  = builder.addTriangle(ICO_V[3 ], ICO_V[8 ], ICO_V[4 ], TL_UV, BM_UV, TR_UV);
    const t10 = builder.addTriangle(ICO_V[4 ], ICO_V[8 ], ICO_V[9 ], TM_UV, BL_UV, BR_UV);
    const t11 = builder.addTriangle(ICO_V[4 ], ICO_V[9 ], ICO_V[5 ], TL_UV, BM_UV, TR_UV);
    const t12 = builder.addTriangle(ICO_V[5 ], ICO_V[9 ], ICO_V[10], TM_UV, BL_UV, BR_UV);
    const t13 = builder.addTriangle(ICO_V[5 ], ICO_V[10], ICO_V[1 ], TL_UV, BM_UV, TR_UV);
    const t14 = builder.addTriangle(ICO_V[1 ], ICO_V[10], ICO_V[6 ], TM_UV, BL_UV, BR_UV);

    // bottom triangles
    const t15 = builder.addTriangle(ICO_V[11], ICO_V[7 ], ICO_V[6 ], BM_UV, TR_UV, TL_UV);
    const t16 = builder.addTriangle(ICO_V[11], ICO_V[8 ], ICO_V[7 ], BM_UV, TR_UV, TL_UV);
    const t17 = builder.addTriangle(ICO_V[11], ICO_V[9 ], ICO_V[8 ], BM_UV, TR_UV, TL_UV);
    const t18 = builder.addTriangle(ICO_V[11], ICO_V[10], ICO_V[9 ], BM_UV, TR_UV, TL_UV);
    const t19 = builder.addTriangle(ICO_V[11], ICO_V[6 ], ICO_V[10], BM_UV, TR_UV, TL_UV);

    // set tangents automatically. tangents go around the zenith CCW, set
    // automatically by following a corresponding edge (and flipping direction
    // when necessary)
    if (addTangents) {
        // top triangles
        t0.autoSetTangents(1);
        t1.autoSetTangents(1);
        t2.autoSetTangents(1);
        t3.autoSetTangents(1);
        t4.autoSetTangents(1);

        // side triangles
        t5.autoSetTangents(2, true);
        t6.autoSetTangents(1);
        t7.autoSetTangents(2, true);
        t8.autoSetTangents(1);
        t9.autoSetTangents(2, true);
        t10.autoSetTangents(1);
        t11.autoSetTangents(2, true);
        t12.autoSetTangents(1);
        t13.autoSetTangents(2, true);
        t14.autoSetTangents(1);

        // bottom triangles
        t15.autoSetTangents(1, true);
        t16.autoSetTangents(1, true);
        t17.autoSetTangents(1, true);
        t18.autoSetTangents(1, true);
        t19.autoSetTangents(1, true);
    }

    builder.setTriangleHelpers();
    builder.autoConnectAllEdges();

    return builder;
}