Very early development. Integration for
[Manifold](https://github.com/elalish/manifold/) and
[Wonderland Engine](https://wonderlandengine.com/).

This integration library has a focus on fast, non-blocking, procedural mesh
generation for games, meaning that:
- Everything is asynchronous
- There are pools of workers, where each worker is an instance of the Manifold library

This comes with some limitations. For example, there is no direct access to
Manifold objects. There is also some overhead because of using workers;
Wonderland Engine meshes need to be converted to a manifold, serialized and sent
to a worker, and then the worker does the reverse. This also means that
operations should be batched for maximum performance; send whole trees of CSG
operations to a worker at once, instead of doing operations one-by-one to
minimise the overhead.

The inputs and outputs are Wonderland Engine meshes, which can be created by
helper classes if you want to do extrusions or solid primitives.

Primitive solids and extrusions from the Manifold library should be avoided.
Instead, the new helper classes should be used to make them, which have correct
vertex normals and support for texture coordinates.

# Usage

See the [example project](https://github.com/playkostudios/manifold-wle-example)

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

# Credits

This project depends on:
- The [Manifold](https://github.com/elalish/manifold/) library
- [Wonderland Engine](https://wonderlandengine.com/)

This project reuses procedural mesh generation code from the
[OctreeCSG-ea library](https://github.com/playkostudios/OctreeCSG-ea).
