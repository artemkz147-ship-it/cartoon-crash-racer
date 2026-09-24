# Source 3D packs (CC0)

Pipeline: download packs → Blender polish (`scripts/polish_export_cars.py`) → `public/models/`.

## Packs

| Pack | License | Source | Used |
|------|---------|--------|------|
| **Kenney Car Kit** (glTF/GLB) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://kenney.nl/assets/car-kit | karts, hatchback, SUV, race-future, tractor-shovel, truck, box, cone, debris |
| **Quaternius Cars Bundle** (GLB) | CC0 / Public Domain | https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk · https://quaternius.com | Sports Car variants for molniya / korol |

Attribution not required (CC0) but appreciated: **Kenney.nl**, **Quaternius**.

## Blender

```bash
blender --background --python assets-src/scripts/polish_export_cars.py
```

Normalizes length ≈ 3.05, plants on Z=0, Y-up GLB for Three.js, garage tint, wheel name cleanup.

## Outputs

- `public/models/cars/{carId,style-*}.glb` — 8 garage + 8 style aliases
- `public/models/props/{crate,barrel,barrel-blue,cone}.glb`
- `public/models/debris/*.glb`
