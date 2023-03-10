# Gypsum

A procedural mesh generation library for
[Wonderland Engine](https://wonderlandengine.com/), with support for
asynchronous Constructive Solid Geometry powered by
[Manifold](https://github.com/elalish/manifold/).

## Features
- Multiple materials in a single manifold
- Automatic vertex indexing
- Procedural vertex normals (hard and smooth)
  - Automatic mesh smoothing with configurable smoothing angles is also included, which uses vertex normals weighted by triangle surface area
- Procedural vertex tangents - required for normal mapping
- Procedural texture wrapping
- Primitive solids:
  - Cuboids
  - Icosahedra
  - Spheres (icospheres, cube spheres, UV spheres, approximate equirectangular projections)
  - Pyramids and prismoids (pyramids, cones, frusta, cylinders, prisms, including with user-provided polylines)
  - Basic solids of revolution (tori, including solids of revolution with user-provided polylines)
  - Extrusions (linear or with curve frames, including with rotation minimizing frames)
- Asynchronous CSG operations
  - A pool of instances of the Manifold library is created; multiple CSG operations can be done in parallel. Pool size is configurable
  - Both primitive solids and user-provided meshes (with limitations) are supported

## Limitations
- Skinned meshes are not supported. Vertex attributes related to skinning are ignored
- Meshes used for CSG operations must be 2-manifold. All procedural mesh generators make 2-manifold geometry, but user-provided meshes might not be 2-manifold
- Automatic manifold generation from user-provided meshes can't deal with singularities and shared edges
- No direct access to the Manifold library due to it being in a separate worker - CSG operations can be batched and sent as a tree of operations to mitigate this issue
- Equirectangular projections will always have artifacts near the poles because custom shaders are needed for proper equirectangular projections
- Extrusions can't self-intersect if they are used for CSG operations
- Solids of revolution can't have a polyline that comes before the middle, touches the middle, or has holes. For now, only torus-like solids of revolution are supported
- Extrusions can't have holes for the slice's polyline. Add them later with CSG operations
- Some UVs have zigzag artifacts. The only way to fix this is to use projective UVs, which require custom shaders and have 3 components (UVW) instead of 2 (UV)

## Current known bugs
- Looped extrusions don't connect properly if bases have different scales

# Table of contents

- [Installing](#installing)
- [Building](#building)
- [Usage](#usage)
  - [Example](#example)
  - [API documentation](#api-documentation)
  - [Procedural meshes](#procedural-meshes)
    - [Getting submeshes](#getting-submeshes)
    - [Applying transformations](#applying-transformations)
    - [Making procedural meshes](#making-procedural-meshes)
    - [Creating MeshGroups from user-provided meshes](#creating-meshgroups-from-user-provided-meshes)
    - [Memory management](#memory-management)
  - [CSG operations](#csg-operations)
- [Contributing](#contributing)
- [Future work](#future-work)
- [Credits](#credits)

# Installing

Install Gypsum and the custom Manifold build with:

```
npm install --save-dev gypsum-mesh github:playkostudios/manifold#package
```

In your build script, make sure to copy the Manifold library and the Gypsum
worker to the deployment folder, by doing something such as this in your
`package.json`:

```json
{
  "scripts": {
    "copy-worker": "shx cp node_modules/gypsum-mesh/dist/gypsum-manifold.worker.* deploy/",
    "copy-manifold": "shx cp node_modules/manifold-3d/manifold.js deploy/ && shx cp node_modules/manifold-3d/manifold.wasm deploy/",
    "build-bundle": "esbuild ./js/bundle.js --minify --sourcemap --bundle --platform=browser --outfile=\"deploy/gypsum-example-bundle.js\"",
    "build": "npm run build-bundle && npm run copy-worker && npm run copy-manifold"
  }
}
```

# Building

```sh
npm install
npm run build
```

Builds will be placed in the `dist` directory.

Note that, for now, this project uses a custom build of the Manifold WebAssembly
bindings, which can be found
[here](https://github.com/playkostudios/manifold/tree/package). Once version 2
of the Manifold bindings is released, the official build will be used.

# Usage

## Example

An example Wonderland Engine project can be found on a
[different respository](https://github.com/playkostudios/gypsum-example)

## API documentation

API documentation can be found on
[Github Pages](https://playkostudios.github.io/gypsum/).

## Procedural meshes

Procedural meshes don't use the WL.Mesh class. Instead, they use their own class
(`MeshGroup`) which contains a list of WL.Mesh and WL.Material pairs
(submeshes), so that a single procedural mesh can have multiple materials.
Procedural meshes also have utilities for applying transformations.

### Getting submeshes

To get the submeshes of a procedural mesh `procMesh`, call
`procMesh.getSubmeshes()`. This will return a list of submeshes, where each
submesh is a pair of WL.Mesh and WL.Material instances. Note that if no material
is provided for a submesh, then the material will be null, so make sure to
either always specify a material, or to have a fallback material ready.

Getting the submeshes is necessary for rendering the procedural mesh:

```js
for (const [mesh, material] of procMesh.getSubmeshes()) {
    this.object.addComponent('mesh', {
        mesh,
        material: material ?? fallbackMaterial
    });
}
```

### Applying transformations

A procedural mesh `procMesh` can be translated (`translate` method), scaled
(`scale` and `uniformScale` methods) and rotated (`rotate` method). A
`gl-matrix` transformation matrix can also be applied to a procedural mesh by
calling the `transform` method.

For example, this rotates a procedural mesh by 45 degrees around the Y axis:

```js
procMesh.rotate(quat.fromEuler(quat.create(), 0, 45 ,0));
```

Transformation methods are chainable.

### Making procedural meshes

All procedural meshes are implemented as subclasses of the `MeshGroup` class. To
make a new procedural mesh, simply instantiate a subclass. The constructor
arguments usually have 1 or more required argument, and all optional arguments
are passed in an options object which can be omitted.

For example, a 1x1x1 cube can be created by creating a new `CubeMesh` instance:

```js
const procMesh = new CubeMesh(1);
```

However, more options can be passed via an options object. For example, in this
6x6x6 cube, the cube is not centered unlike before, each face has a separate
material, and the UVs for each face are set to each UV corner:

```js
const procMesh = new CubeMesh(6, {
  center: false,
  // supply WL.Material instances for the following properties:
  // instead of a separate material for each side, `material` can also be passed to set all sides
  leftMaterial: this.leftMaterial,
  rightMaterial: this.rightMaterial,
  downMaterial: this.downMaterial,
  upMaterial: this.upMaterial,
  backMaterial: this.backMaterial,
  frontMaterial: this.frontMaterial,
  // supply UV coordinates for the top-left, top-right, bottom-left and bottom-right corners of a face by passing the following properties:
  // a position-to-UV ratio can also be provided instead of an array of UVs
  leftUVs: [[0, 1], [1, 1], [0, 0], [1, 0]],
  rightUVs: [[0, 1], [1, 1], [0, 0], [1, 0]],
  downUVs: [[0, 1], [1, 1], [0, 0], [1, 0]],
  upUVs: [[0, 1], [1, 1], [0, 0], [1, 0]],
  backUVs: [[0, 1], [1, 1], [0, 0], [1, 0]],
  frontUVs: [[0, 1], [1, 1], [0, 0], [1, 0]],
});
```

A list of all procedural mesh classes can be found in the API documentation, in
the `Procedural Mesh` category.

Currently, the following procedural meshes are available:
- Cuboids:
  - Cube
  - Rectangular cuboid
- Extrusions:
  - Curve extrusion
  - Linear extrusion
  - Solid of revolution
- Icosahedron
- Prismoids:
  - Cylinder
  - Frustum
  - Prism
  - Prismoid
- Pyramids:
  - Cone
  - Pyramid
- Spheres:
  - Cube sphere
  - Icosphere
  - UV sphere
- Torus

### Creating MeshGroups from user-provided meshes

User-provided meshes (as WL.Mesh instances) can be converted to `MeshGroup`
instances if you need to trasform them:

```js
// with material
const procMesh = MeshGroup.fromWLEMesh(mesh, material);
// ... or without material (material will be null)
// const procMesh = MeshGroup.fromWLEMesh(mesh);

// apply transformation to mesh group
procMesh.uniformScale(0.01);
```

The constructor can also be used if you want to make a `MeshGroup` consisting of
multiple user-provided meshes. In this case, a list of submeshes (mesh and
material pairs) must be supplied:
```js
const procMesh = new MeshGroup([
  [firstMesh, firstMaterial],
  [secondMesh, null], // second mesh has no material, null must be passed
  [thirdMesh, thirdMaterial],
]);

// apply transformation to mesh group
procMesh.uniformScale(0.01);
```

Note that creating `MeshGroup` instances with user-provided meshes can fail if
the meshes are used for CSG operations. This is because there is no connectivity
information in the meshes, so the connectivity between triangles must be
guessed. Currently, a naive algorithm based on vertex distance is used for
guessing connectivity, but this fails if singularities exist, or if there are
shared edges between more than 2 triangles.

Note that transforming `MeshGroup` instances created from user-provided meshes
**will modify the original meshes in-place**. If you want to keep the original
mesh intact, then pass a clone of the original mesh to the `MeshGroup`, instead
of using the original mesh. A mesh clone function is available in the library
(`cloneMesh`), but note that it does not copy skinning data.

### Memory management

Procedural meshes create new `WL.Mesh` instances used for the submeshes of a
`MeshGroup`. `WL.Mesh` instances are not automatically destroyed, as they are an
engine resource, and therefore aren't garbage-collected.

If you are creating a procedural mesh and only using it for rendering, then the
meshes don't have to be destroyed. They only need to be destroyed after you know
you will no longer render them.

To destroy all the meshes in a `MeshGroup`, call `MeshGroup.dispose()`. For
example, if you have a procedural mesh `procMesh`, then call
`procMesh.dispose()`. Note that if a `MeshGroup` is created from a user-provided
mesh, then the mesh will still be destroyed, meaning that if you passed the
original mesh without cloning to the `MeshGroup`, then that mesh will be
destroyed. If a clone was passed instead, then the clone will be destroyed.

If you are creating a mesh that is only used for a CSG operation, and then never
used again, then it is recommended that you set the auto-dispose flag by calling
`MeshGroup.mark()`. For example, if you have a procedural cube `diffCube` that
is only used for subtracting another mesh in a CSG operation, then you can mark
the cube to be auto-disposed by calling `diffCube.mark()`, and the cube will be
disposed after it's used for a CSG operation. Attempting to use the cube after
it was disposed will not work. The `mark` method is chainable.

## CSG operations

CSG operations are done by making a tree of CSG operations, sending the tree to
a worker, and waiting for the operations to finish asynchronously. However,
there can be more than 1 worker, and the number of workers is configurable, so
some extra setup work needs to be done; a pool of workers needs to be created,
with the wanted number of workers, and the CSG operations are dispatched via
this worker pool. The worker pool will then decide which worker to send the CSG
operation to; the CSG pool load-balances.

Example (CSG pool has only 1 worker here):

```js
// create a new pool of workers. note that the workers are not initialised until
// the first csg operation is dispatched, or until `initialize` is called
const csg = new CSGPool(1);

// if you want to make sure that the pool is initialized before the first csg
// operation to prevent stuttering, then do the following:
// await csg.initialize();

// subtract 2 cubes, where the subtracting cube is offset by (0.5, 0.5, 0.5)
const resultMesh = await csg.dispatch({
  operation: 'subtract',
  left: new CubeMesh(1).mark(),
  right: new CubeMesh(1).translate([0.5, 0.5, 0.5]).mark(),
});

// get submeshes of the result of the CSG operation
const resultSubmeshes = resultMesh.getSubmeshes();

// add each submesh to the scene
for (const [mesh, material] of resultSubmeshes) {
  this.object.addComponent('mesh', {
    mesh,
    material: material ?? this.fallbackMaterial
  });
}
```

`CSGPool` are expensive to create, and there is a limit of workers that can be
created in a browser. Ideally, there should be only 1 `CSGPool` instance with a
reasonable amount of workers (such as 3), and the pool should be reused accross
all scripts that do CSG operations.

If no more CSG operations will be done, then a `CSGPool` can be destroyed by
calling the `dispose` method. For example, in a pool `csg`:

```js
csg.dispose();
```

Disposing a pool will invalidate it; any operations done on a disposed pool will
throw an error. Disposing a pool will also terminate all workers created by the
pool.

# Contributing

The current API is ugly and should be considered unstable; expect changes to the
API in the future. Contributions improving the usability of the API would be
greatly appreciated, especially around the Triangle and MeshBuilder classes.

# Future work

The Kanban for this library can be found
[here](https://github.com/orgs/playkostudios/projects/6/views/1).

Summary:
- GLTF extension for edge connectivity. Need to work with the Manifold developers for this one
- Fix zigzag artifacts in UVs of extrusions
- Use angle-weighted vertex normals
- Improve solids of revolution:
  - Solid middles
  - Self-intersecting polylines
- Improve extrusions:
  - Allow slices with holes
- Mesh decimation utilities
- Better mesh to manifold conversion for user-provided meshes with no edge connectivity data

# Developer notes

## Wonderland Engine 1.0.0 port

The API port is basically done, but it was backported as it's not backwards
compatible. To convert to 1.0.0:
1. Replace all `newShim_Mesh` occurances with `new Mesh`
2. Replace all `WonderlandEngine` imports from the `backport-shim.ts` file with imports from `@wonderlandengine/api`. If the file is being imported but `WonderlandEngine` is not part of the imports, remove the import line
3. Delete `backport-shim.ts`
4. Update the example project

# Credits

This project depends on:
- The [Manifold](https://github.com/elalish/manifold/) library (Apache 2.0 license)
- [Wonderland Engine](https://wonderlandengine.com/), API found [here](https://github.com/WonderlandEngine/api) (API under MIT license)
- [gl-matrix](https://glmatrix.net/) (MIT license)

This projects uses following tooling:
- [TypeScript](https://www.typescriptlang.org/) (Apache 2.0 license)
- [esbuild](https://esbuild.github.io/) (MIT license)
- [TypeDoc](https://typedoc.org/) (Apache 2.0 license)
- [ESLint](https://eslint.org/) (MIT license)
- [TypeScript ESLint](https://typescript-eslint.io/) (BSD 2-clause license)
- [npm-dts](https://github.com/vytenisu/npm-dts) (MIT license)
- [rimraf](https://github.com/isaacs/rimraf/) (ISC license)

This project reuses some procedural mesh generation code from the
[OctreeCSG-ea library](https://github.com/playkostudios/OctreeCSG-ea), which is
a fork of the [OctreeCSG library](https://github.com/giladdarshan/OctreeCSG).

Finally, the following resources were used to implement some algorithms:
- `Computational Geometry: Algorithms and Applications` (Mark de Berg, Otfried Cheong, Marc van Kerveld, Mark Overmars) - used for the triangulation algorithm
- `Computation of Rotation Minimizing Frames` (Wenping Wang, Bert Juttler, Dayue Zheng, and Yang Liu) - used for curve frame generation