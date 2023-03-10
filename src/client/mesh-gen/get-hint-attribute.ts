import { MeshAttribute } from '@wonderlandengine/api';

import type { Mesh, MeshAttributeAccessor } from '@wonderlandengine/api';
import type { AllowedExtraMeshAttribute } from '../../common/AllowedExtraMeshAttribute';

// TODO continue documentation here
/**
 * 
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

export function getHintAttributeFromSet(mesh: Mesh, hint: Set<AllowedExtraMeshAttribute>, attribute: AllowedExtraMeshAttribute): MeshAttributeAccessor | null {
    if (hint.has(attribute)) {
        return getHintAttribute(mesh, attribute);
    } else {
        return null;
    }
}
