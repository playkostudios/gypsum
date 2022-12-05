import { vec2 } from 'gl-matrix';
import isClockwise2DPolygon from './is-clockwise-2d-polygon';
import partition2DPolygon from './partition-2d-polygon';
import triangulateMonotone2DPolygon from './triangulate-monotone-2d-polygon';

/**
 * Triangulate a given polyline into a list of index triplets.
 *
 * @param polyline - The polyline to triangulate.
 * @param output - The output array to append to.
 * @returns A list of index triplet, where each triplet contains an index for the original polyline containing the corner of each triangle, in order.
 */
export default function triangulate2DPolygon(polyline: Array<vec2>, output?: Array<number>): Array<number> {
    const isClockwiseHint = isClockwise2DPolygon(polyline);
    const partitions = partition2DPolygon(polyline, undefined, isClockwiseHint);
    let outputSize = 0;

    for (const partition of partitions) {
        outputSize += (partition.length - 2) * 3;
    }

    if (output) {
        if (output.length < outputSize) {
            output.length = outputSize;
        }
    } else {
        output = new Array(outputSize);
    }

    let index = 0;
    for (const partition of partitions) {
        [output, index] = triangulateMonotone2DPolygon(partition, output, index, isClockwiseHint);
    }

    return output;
}