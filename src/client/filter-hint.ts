import { MeshAttribute } from '@wonderlandengine/api';

import type { AllowedExtraMeshAttribute } from '../common/AllowedExtraMeshAttribute';
import type { Hint } from '../common/Hint';

const FILTERABLE_ATTRS: Array<[attrType: AllowedExtraMeshAttribute, attrName: string]> = [
    [MeshAttribute.Normal, 'normal'],
    [MeshAttribute.TextureCoordinate, 'UV'],
    [MeshAttribute.Tangent, 'tangent'],
    [MeshAttribute.Color, 'color'],
];

export function filterHint(supportsNormals: boolean, supportsUVs: boolean, supportsTangents: boolean, supportsColors: boolean, hint?: Hint): Hint {
    if (hint) {
        const newHint: Hint = new Set();

        for (const [attrType, attrName] of FILTERABLE_ATTRS) {
            if (hint.has(attrType)) {
                if (supportsNormals) {
                    newHint.add(attrType);
                } else {
                    console.warn(`Filtered "${attrName}" hint; unsupported by this MeshGroup generator`);
                }
            }
        }

        return newHint;
    } else {
        hint = new Set();

        if (supportsNormals) {
            hint.add(MeshAttribute.Normal);
        }
        if (supportsUVs) {
            hint.add(MeshAttribute.TextureCoordinate);
        }
        if (supportsTangents) {
            hint.add(MeshAttribute.Tangent);
        }
        if (supportsColors) {
            hint.add(MeshAttribute.Color);
        }

        return hint;
    }
}