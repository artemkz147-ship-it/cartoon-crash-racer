"""
Blender headless polish → public/models/env/*.glb
Usage: blender --background --python assets-src/scripts/polish_export_env.py
Normalizes scale, plants on Z=0, Y-up GLB for Three.js.
"""
import bpy
import os
from mathutils import Vector, Euler
from math import radians

ROOT = "/workspace/cartoon-crash-racer"
KEN = os.path.join(ROOT, "assets-src/kenney")
OUT = os.path.join(ROOT, "public/models/env")

ROADS = os.path.join(KEN, "city-kit-roads/Models/GLB format")
RACE = os.path.join(KEN, "racing-kit/Models/GLTF format")
NATURE = os.path.join(KEN, "nature-kit/Models/GLTF format")
CASTLE = os.path.join(KEN, "castle-kit/Models/GLB format")
COMM = os.path.join(KEN, "city-kit-commercial/Models/GLB format")
SUB = os.path.join(KEN, "city-kit-suburban/Models/GLB format")
IND = os.path.join(KEN, "city-kit-industrial/Models/GLB format")

# out_name → (src, target_size_spec)
# size_spec: ("max", meters) | ("x", m) | ("y", m) | ("z", m) | ("xy", m) | ("footprint", m)
# footprint = max(x,y) horizontal
ENV_MAP = {
    # Roads / curbs / barriers (city + racing)
    "road_straight": (os.path.join(ROADS, "road-straight.glb"), ("xy", 8.0)),
    "road_straight_barrier": (os.path.join(ROADS, "road-straight-barrier.glb"), ("xy", 8.0)),
    "road_curve": (os.path.join(ROADS, "road-curve.glb"), ("xy", 8.0)),
    "road_slant": (os.path.join(ROADS, "road-slant.glb"), ("xy", 8.0)),
    "curb_red": (os.path.join(RACE, "barrierRed.glb"), ("x", 2.4)),
    "curb_white": (os.path.join(RACE, "barrierWhite.glb"), ("x", 2.4)),
    "jersey_barrier": (os.path.join(RACE, "barrierWall.glb"), ("x", 3.0)),
    "guardrail": (os.path.join(RACE, "rail.glb"), ("x", 4.0)),
    "guardrail_double": (os.path.join(RACE, "railDouble.glb"), ("x", 4.0)),
    "construction_barrier": (os.path.join(ROADS, "construction-barrier.glb"), ("x", 2.2)),
    "ramp": (os.path.join(RACE, "ramp.glb"), ("y", 6.0)),
    "road_ramp": (os.path.join(RACE, "roadRamp.glb"), ("xy", 8.0)),
    # Props / lights / billboards
    "lamp": (os.path.join(ROADS, "light-square.glb"), ("z", 5.5)),
    "lamp_double": (os.path.join(ROADS, "light-square-double.glb"), ("z", 5.5)),
    "lamp_race": (os.path.join(RACE, "lightPostModern.glb"), ("z", 6.0)),
    "billboard": (os.path.join(RACE, "billboard.glb"), ("z", 5.0)),
    "billboard_low": (os.path.join(RACE, "billboardLow.glb"), ("z", 3.5)),
    "cone": (os.path.join(ROADS, "construction-cone.glb"), ("z", 0.9)),
    "dumpster": (os.path.join(ROADS, "dumpster.glb"), ("x", 2.4)),
    "grandstand": (os.path.join(RACE, "grandStand.glb"), ("x", 10.0)),
    "grandstand_covered": (os.path.join(RACE, "grandStandCovered.glb"), ("x", 10.0)),
    "fence": (os.path.join(RACE, "fenceStraight.glb"), ("x", 4.0)),
    "pylon": (os.path.join(RACE, "pylon.glb"), ("z", 1.2)),
    "flag_checkers": (os.path.join(RACE, "flagCheckers.glb"), ("z", 4.5)),
    # Nature
    "tree_pine": (os.path.join(NATURE, "tree_pineDefaultA.glb"), ("z", 7.5)),
    "tree_pine_b": (os.path.join(NATURE, "tree_pineDefaultB.glb"), ("z", 7.0)),
    "tree_oak": (os.path.join(NATURE, "tree_oak.glb"), ("z", 6.5)),
    "tree_default": (os.path.join(NATURE, "tree_default.glb"), ("z", 6.0)),
    "tree_palm": (os.path.join(NATURE, "tree_palmTall.glb"), ("z", 8.0)),
    "tree_cone": (os.path.join(NATURE, "tree_cone_dark.glb"), ("z", 6.5)),
    "cactus_tall": (os.path.join(NATURE, "cactus_tall.glb"), ("z", 3.2)),
    "cactus_short": (os.path.join(NATURE, "cactus_short.glb"), ("z", 1.6)),
    "rock_large": (os.path.join(NATURE, "rock_largeA.glb"), ("xy", 3.5)),
    "rock_large_b": (os.path.join(NATURE, "rock_largeC.glb"), ("xy", 3.0)),
    "rock_small": (os.path.join(NATURE, "rock_smallA.glb"), ("xy", 1.4)),
    "bush": (os.path.join(NATURE, "plant_bushLarge.glb"), ("xy", 2.2)),
    "cliff_rock": (os.path.join(NATURE, "cliff_rock.glb"), ("z", 6.0)),
    "rocks_castle": (os.path.join(CASTLE, "rocks-large.glb"), ("xy", 4.0)),
    # Buildings
    "building_a": (os.path.join(COMM, "low-detail-building-a.glb"), ("z", 10.0)),
    "building_b": (os.path.join(COMM, "low-detail-building-b.glb"), ("z", 12.0)),
    "building_c": (os.path.join(COMM, "low-detail-building-c.glb"), ("z", 9.0)),
    "building_d": (os.path.join(COMM, "low-detail-building-d.glb"), ("z", 11.0)),
    "skyscraper": (os.path.join(COMM, "building-skyscraper-a.glb"), ("z", 22.0)),
    "house_a": (os.path.join(SUB, "building-type-a.glb"), ("z", 6.0)),
    "house_b": (os.path.join(SUB, "building-type-c.glb"), ("z", 5.5)),
    "tree_suburban": (os.path.join(SUB, "tree-large.glb"), ("z", 6.5)),
    "industrial_a": (os.path.join(IND, "building-a.glb"), ("z", 9.0)),
    "industrial_b": (os.path.join(IND, "building-c.glb"), ("z", 8.0)),
    "chimney": (os.path.join(IND, "chimney-medium.glb"), ("z", 12.0)),
    "container": (os.path.join(IND, "shipping-container-a.glb"), ("x", 6.0)),
    "container_b": (os.path.join(IND, "shipping-container-b.glb"), ("x", 6.0)),
    "water_tower": (os.path.join(IND, "water-tower.glb"), ("z", 10.0)),
    "tank": (os.path.join(IND, "detail-tank.glb"), ("z", 4.0)),
}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def world_bounds(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    return mn, mx


def apply_transforms(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
    if objs:
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def normalize(size_spec):
    ms = meshes()
    if not ms:
        raise RuntimeError("no meshes")

    root = bpy.data.objects.new("EnvRoot", None)
    bpy.context.collection.objects.link(root)
    for o in list(bpy.context.scene.objects):
        if o != root and o.parent is None:
            o.parent = root

    mn, mx = world_bounds(meshes())
    size = mx - mn
    mode, target = size_spec
    if mode == "max":
        longest = max(size.x, size.y, size.z, 0.01)
    elif mode == "x":
        longest = max(size.x, 0.01)
    elif mode == "y":
        longest = max(size.y, 0.01)
    elif mode == "z":
        longest = max(size.z, 0.01)
    elif mode == "xy" or mode == "footprint":
        longest = max(size.x, size.y, 0.01)
    else:
        longest = max(size.x, size.y, size.z, 0.01)

    s = target / longest
    root.scale = (s, s, s)
    bpy.context.view_layer.update()

    mn, mx = world_bounds(meshes())
    root.location -= Vector(((mn.x + mx.x) * 0.5, (mn.y + mx.y) * 0.5, mn.z))
    bpy.context.view_layer.update()

    apply_transforms([root] + meshes())
    for o in meshes():
        o.parent = None
    bpy.data.objects.remove(root, do_unlink=True)

    for o in meshes():
        for p in o.data.polygons:
            p.use_smooth = False


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_vertex_color="MATERIAL",
        export_yup=True,
        export_animations=False,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
    )
    print("EXPORTED", path, os.path.getsize(path), "bytes")


def process(out_name, src, size_spec):
    print("===", out_name, "←", src)
    if not os.path.isfile(src):
        print("MISSING", src)
        return False
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=src)
    normalize(size_spec)
    export_glb(os.path.join(OUT, f"{out_name}.glb"))
    mn, mx = world_bounds(meshes())
    print("  size", [round(x, 3) for x in (mx - mn)])
    return True


def main():
    os.makedirs(OUT, exist_ok=True)
    ok = 0
    miss = 0
    for name, (src, spec) in ENV_MAP.items():
        try:
            if process(name, src, spec):
                ok += 1
            else:
                miss += 1
        except Exception as e:
            print("FAIL", name, e)
            miss += 1
    print(f"DONE env_ok={ok} miss={miss} out={OUT}")


if __name__ == "__main__":
    main()
