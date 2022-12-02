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
- Normals and tangents aren't transformed properly by CSG operations
  - [Waiting for an external API change to fix this](https://github.com/elalish/manifold/issues/282)
  - In the meantime, the input meshes could be transformed before doing a CSG operation with them
- Looped extrusions don't connect properly if bases have different scales

# Installing

TODO upload new build, publish npm package

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

TODO finish docstrings, add github pages, add link to documentation

## Procedural meshes

Procedural meshes don't use the WL.Mesh class. Instead, they use their own class
which contains a list of WL.Mesh instances (submeshes), so that a single
procedural mesh can have multiple materials. Procedural meshes also have
utilities for applying transformations.

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

### Making procedural meshes

#### Cuboids

##### Cube

Default cube (length 1):

```js
const cone = new CubeMesh(1);
```

Example cube with more options (length 6):

```js
const cone = new CubeMesh(6, {
  center: true,
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

##### Rectangular cuboid

TODO example

#### Spheres

##### Cube sphere

TODO example

##### Icosphere

TODO example

##### UV sphere

TODO example

#### Cylinder

TODO example

#### Extrusions

##### Linear extrusion

TODO example

##### Curve extrusion

TODO example

##### Solid of revolution

TODO example

#### Icosahedron

TODO example

#### Prismoids

##### Frustum

TODO example

##### Prism

TODO example

##### Prismoid

TODO example

#### Pyramids

##### Cone

Default cone (radius 0.5, height 1, smooth normals):

```js
const cone = new ConeMesh();
```

Example cone with more options:

```js
const cone = new ConeMesh({
  subDivisions: 24,
  radius: 2,
  height: 6,
  smoothNormals: true,
  // supply WL.Material instances for the following properties:
  baseMaterial: this.baseMaterial,
  sideMaterial: this.sideMaterial,
});
```

##### Pyramid

TODO example

#### Torus

TODO example

# Contributing

The current API is ugly and should be considered unstable; expect changes to the
API in the future. Contributions improving the usability of the API would be
greatly appreciated, especially around the Triangle and ManifoldBuilder classes.

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