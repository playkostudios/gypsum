import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';

export class ManifoldWLMesh extends BaseManifoldWLMesh {
    static fromWLEMesh(mesh: WL.Mesh, material: WL.Material) {
        return new ManifoldWLMesh([ mesh, material ]);
    }

    addSubmesh(mesh: WL.Mesh, material: WL.Material): number {
        this.submeshes.push([ mesh, material ]);
        return this.submeshCount - 1;
    }
}