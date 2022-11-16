export function wleMeshToOBJ(wleMesh) {
    // converts a wonderland WL.Mesh object to an wavefront obj 3D model file.
    // this was created because the mesh debug shaders for wonderland engine
    // don't work properly for indexed meshes, so debugging must be done in an
    // external program

    const positions = wleMesh.attribute(WL.MeshAttribute.Position);
    let lines = [];

    for (let i = 0; i < positions.length; i++) {
        const [x, y, z] = positions.get(i);
        lines.push(`v ${x} ${y} ${z}`);
    }

    const indexCount = wleMesh.indexData.length;
    for (let i = 0; i < indexCount;) {
        lines.push(`f ${wleMesh.indexData[i++] + 1} ${wleMesh.indexData[i++] + 1} ${wleMesh.indexData[i++] + 1}`);
    }

    const blob = new Blob([lines.join('\n')], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'mesh.obj';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}