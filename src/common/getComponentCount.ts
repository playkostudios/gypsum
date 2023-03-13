import { MeshAttribute } from '@wonderlandengine/api';

/** Get the amount of float for a specific vertex attribute. */
export function getComponentCount(attrType: MeshAttribute) {
    switch (attrType) {
        case MeshAttribute.Tangent:
        case MeshAttribute.Color:
            return 4;
        case MeshAttribute.Position:
        case MeshAttribute.Normal:
            return 3;
        case MeshAttribute.TextureCoordinate:
            return 2;
        default:
            throw new Error(`Unknown or disallowed mesh attribute with type ID ${attrType}`);
    }
}