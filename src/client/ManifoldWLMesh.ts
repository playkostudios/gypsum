import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';

export class ManifoldWLMesh extends BaseManifoldWLMesh {
    static fromWLEMesh(mesh: WL.Mesh, material: WL.Material) {
        return new ManifoldWLMesh([ mesh, material ]);
    }

    addSubmesh(mesh: WL.Mesh, material: WL.Material): number {
        this.submeshes.push([ mesh, material ]);
        return this.submeshCount - 1;
    }

    clone(materials?: Array<WL.Material>): ManifoldWLMesh {
        const submeshes = new Array(this.submeshCount);

        for (let i = 0; i < this.submeshCount; i++) {
            const pair = this.submeshes[i];

            if (materials) {
                submeshes[i] = [pair[0], materials[i]];
            } else {
                submeshes[i] = [pair[0], pair[1]];
            }
        }

        return new ManifoldWLMesh(submeshes);
    }
}