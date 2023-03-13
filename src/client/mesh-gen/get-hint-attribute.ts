import { MeshAttribute } from '@wonderlandengine/api';

import type { Mesh, MeshAttributeAccessor } from '@wonderlandengine/api';
import type { AllowedExtraMeshAttribute } from '../../common/AllowedExtraMeshAttribute';

/**
 * Get a mesh attribute from a given mesh. If the attribute is missing and
 * failOnMissing is true (true by default), then an error is thrown.
 *
 * @param mesh - The mesh to get the attribute from
 * @param attribute - The mesh attribute type
 * @param failOnMissing - Should an error be thrown instead of returning null when the attribute is missing? True by default
 */
export function getHintAttribute(mesh: Mesh, attribute: AllowedExtraMeshAttribute, failOnMissing?: true): MeshAttributeAccessor;
export function getHintAttribute(mesh: Mesh, attribute: AllowedExtraMeshAttribute, failOnMissing: false): MeshAttributeAccessor | null;
export function getHintAttribute(mesh: Mesh, attribute: AllowedExtraMeshAttribute, failOnMissing: boolean): MeshAttributeAccessor | null;
export function getHintAttribute(mesh: Mesh, attribute: AllowedExtraMeshAttribute, failOnMissing = true): MeshAttributeAccessor | null {
    const attrAcc = mesh.attribute(attribute);

    if (!attrAcc && failOnMissing) {
        let prettyName: string;

        switch (attribute) {
            case MeshAttribute.Normal: prettyName = 'normal'; break;
            case MeshAttribute.TextureCoordinate: prettyName = 'texture coordinate'; break;
            case MeshAttribute.Tangent: prettyName = 'tangent'; break;
            case MeshAttribute.Color: prettyName = 'color'; break;
            default: prettyName = `unknown ID ${attribute}`;
        }

        throw new Error(`Could not get hinted mesh attribute (${prettyName})`);
    }

    return attrAcc;
}

/**
 * Similar to {@link getHintAttribute}, except failOnMissing is always true, and
 * the attribute must be in the hint set, otherwise null is returned.
 *
 * @param mesh - The mesh to get the attribute from
 * @param hint - The set of attributes to check against. If the attribute is not in the set, null is returned
 * @param attribute - The mesh attribute type
 */
export function getHintAttributeFromSet(mesh: Mesh, hint: Set<AllowedExtraMeshAttribute>, attribute: AllowedExtraMeshAttribute): MeshAttributeAccessor | null {
    if (hint.has(attribute)) {
        return getHintAttribute(mesh, attribute);
    } else {
        return null;
    }
}
