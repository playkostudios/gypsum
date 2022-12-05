import { vec3 } from 'gl-matrix';

/**
 * Try to fix a list of tangents that will be fed to a curve frame generator,
 * in-place. Each tangent is normalized, and zero-length tangents are replaced
 * by the nearest tangent.
 *
 * @param tangents - A list of curve tangents (direction of the curve).
 * @returns A new list of curve tangents without any invalid tangents.
 */
export function fixTangentList(tangents: Array<vec3>): Array<vec3> {
    const tangentCount = tangents.length;
    let lastValidTangent: vec3 | null = null;
    let invalidIdxEnd: number | null = null;

    for (let i = 0; i < tangentCount; i++) {
        const tangent = tangents[i];

        if (vec3.squaredLength(tangent) === 0) {
            // invalid tangent. either replace it with a previous valid tangent,
            // or queue it up to be replaced with a next valid tangent
            if (lastValidTangent) {
                tangents[i] = vec3.clone(lastValidTangent);
            } else {
                invalidIdxEnd = i;
            }
        } else {
            // valid tangent. normalize it
            vec3.normalize(tangent, tangent);
            lastValidTangent = tangent;

            // replace any previously invalid tangents that had no previous
            // valid tangents
            if (invalidIdxEnd !== null) {
                for (let j = 0; j <= invalidIdxEnd; j++) {
                    tangents[j] = vec3.clone(lastValidTangent);
                }

                invalidIdxEnd = null;
            }
        }

        tangents.push(tangent);
    }

    if (invalidIdxEnd !== null) {
        throw new Error('Could not fix tangent list; there are no valid tangents in the list');
    }

    return tangents;
}