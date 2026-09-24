# Source 3D packs (CC0)

Pipeline: download packs → Blender polish (`scripts/polish_export_cars.py`) → `public/models/`.

## Packs

| Pack | License | Source | Used |
|------|---------|--------|------|
| **Kenney Car Kit** (glTF/GLB) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://kenney.nl/assets/car-kit | karts, hatchback, SUV, race-future, tractor-shovel, truck, box, cone, debris |
| **Quaternius Cars Bundle** (GLB) | CC0 / Public Domain | https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk · https://quaternius.com | Sports Car variants for molniya / korol |
| **Kenney City Kit (Roads)** | CC0 | https://kenney.nl/assets/city-kit-roads | road tiles, lamps, cones, barriers |
| **Kenney Racing Kit** | CC0 | https://kenney.nl/assets/racing-kit | curbs, jersey, rails, ramps, grandstands, billboards |
| **Kenney Nature Kit** | CC0 | https://kenney.nl/assets/nature-kit | trees, cactus, rocks, cliffs |
| **Kenney Castle Kit** | CC0 | https://kenney.nl/assets/castle-kit | rocks |
| **Kenney City Kit (Commercial / Suburban / Industrial)** | CC0 | kenney.nl | buildings, houses, chimneys, containers |

Attribution not required (CC0) but appreciated: **Kenney.nl**, **Quaternius**.

## Blender

```bash
blender --background --python assets-src/scripts/polish_export_cars.py
blender --background --python assets-src/scripts/polish_export_env.py
```

Normalizes length ≈ 3.05, plants on Z=0, Y-up GLB for Three.js, garage tint, wheel name cleanup.

## Outputs

- `public/models/cars/{carId,style-*}.glb` — 8 garage + 8 style aliases
- `public/models/props/{crate,barrel,barrel-blue,cone}.glb`
- `public/models/debris/*.glb`
- `public/models/env/*.glb` — roads, curbs, barriers, theme props (~53)
