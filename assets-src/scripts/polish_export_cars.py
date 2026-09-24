"""
Blender headless polish → public/models/{cars,props,debris}/*.glb
Usage: blender --background --python assets-src/scripts/polish_export_cars.py
"""
import bpy
import os
from mathutils import Vector, Color

ROOT = "/workspace/cartoon-crash-racer"
KENNEY = os.path.join(ROOT, "assets-src/kenney/car-kit/Models/GLB format")
QUAT = os.path.join(ROOT, "assets-src/quaternius/cars-bundle")
OUT_CARS = os.path.join(ROOT, "public/models/cars")
OUT_PROPS = os.path.join(ROOT, "public/models/props")
OUT_DEBRIS = os.path.join(ROOT, "public/models/debris")
TARGET_LENGTH = 3.05

# Garage carId → source + RGB tint (0..1)
CAR_MAP = {
    "kartoshka": (os.path.join(KENNEY, "kart-ooli.glb"), (1.00, 0.30, 0.30)),
    "zhuk": (os.path.join(KENNEY, "hatchback-sports.glb"), (0.24, 0.80, 0.43)),
    "tank": (os.path.join(KENNEY, "suv.glb"), (0.42, 0.48, 0.54)),
    "raketa": (os.path.join(KENNEY, "race-future.glb"), (0.24, 0.55, 1.00)),
    "monster": (os.path.join(KENNEY, "tractor-shovel.glb"), (0.61, 0.35, 0.71)),
    "molniya": (os.path.join(QUAT, "Sports Car.glb"), (1.00, 0.90, 0.40)),
    "bulldozer": (os.path.join(KENNEY, "truck.glb"), (1.00, 0.55, 0.10)),
    "korol": (os.path.join(QUAT, "Sports Car-1mkmFkAz5v.glb"), (1.00, 0.13, 0.27)),
}

# AI style aliases (meshes.js style names)
STYLE_MAP = {
    "buggy": CAR_MAP["kartoshka"],
    "coupe": CAR_MAP["zhuk"],
    "tank": CAR_MAP["tank"],
    "rocket": CAR_MAP["raketa"],
    "monster": CAR_MAP["monster"],
    "sport": CAR_MAP["molniya"],
    "truck": CAR_MAP["bulldozer"],
    "king": CAR_MAP["korol"],
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


def rename_wheels():
    for o in meshes():
        raw = o.name.lower().replace(" ", "").replace("_", "").replace("-", "")
        if "wheel" not in raw and "cylinder" not in raw:
            continue
        if "frontleft" in raw:
            o.name = "wheel-front-left"
        elif "frontright" in raw:
            o.name = "wheel-front-right"
        elif "backleft" in raw or "rearleft" in raw:
            o.name = "wheel-back-left"
        elif "backright" in raw or "rearright" in raw:
            o.name = "wheel-back-right"
        elif "backwheel" in raw or "rearwheel" in raw or "backwheels" in raw:
            o.name = "wheel-back"
        elif "frontwheel" in raw:
            o.name = "wheel-front"
        elif raw.startswith("wheel"):
            # keep kenney wheel-front-left etc if already good
            if o.name.startswith("wheel-"):
                pass
            else:
                o.name = "wheel"


def recolor_body(tint):
    body_cands = [o for o in meshes() if "wheel" not in o.name.lower() and "character" not in o.name.lower()]
    if not body_cands:
        body_cands = meshes()
    body = max(body_cands, key=lambda o: len(o.data.vertices))
    body.name = "body"
    tint_c = Color(tint)
    for slot in body.material_slots:
        mat = slot.material
        if not mat:
            continue
        mat = mat.copy()
        slot.material = mat
        if not mat.use_nodes:
            mat.diffuse_color = (tint_c.r, tint_c.g, tint_c.b, 1)
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        base = bsdf.inputs.get("Base Color")
        if not base:
            continue
        if base.is_linked:
            from_sock = base.links[0].from_socket
            nt.links.remove(base.links[0])
            mix = nt.nodes.new("ShaderNodeMixRGB")
            mix.blend_type = "MULTIPLY"
            mix.inputs["Fac"].default_value = 0.8
            mix.inputs["Color2"].default_value = (tint_c.r, tint_c.g, tint_c.b, 1.0)
            nt.links.new(from_sock, mix.inputs["Color1"])
            nt.links.new(mix.outputs["Color"], base)
        else:
            base.default_value = (tint_c.r, tint_c.g, tint_c.b, 1.0)


def normalize_vehicle(tint):
    ms = meshes()
    if not ms:
        raise RuntimeError("no meshes")

    root = bpy.data.objects.new("CarRoot", None)
    bpy.context.collection.objects.link(root)
    for o in list(bpy.context.scene.objects):
        if o != root and o.parent is None:
            o.parent = root

    mn, mx = world_bounds(meshes())
    length = max((mx - mn).y, 0.01)
    s = TARGET_LENGTH / length
    root.scale = (s, s, s)
    bpy.context.view_layer.update()

    mn, mx = world_bounds(meshes())
    root.location -= Vector(((mn.x + mx.x) * 0.5, (mn.y + mx.y) * 0.5, mn.z))
    bpy.context.view_layer.update()

    apply_transforms([root] + meshes())
    for o in meshes():
        o.parent = None
    bpy.data.objects.remove(root, do_unlink=True)

    # Remove kart driver mesh if present
    for o in list(meshes()):
        if "character" in o.name.lower():
            bpy.data.objects.remove(o, do_unlink=True)

    rename_wheels()
    if tint is not None:
        recolor_body(tint)

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


def process_car(out_name, src, tint):
    print("===", out_name, "←", src)
    if not os.path.isfile(src):
        print("MISSING", src)
        return False
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=src)
    normalize_vehicle(tint)
    export_glb(os.path.join(OUT_CARS, f"{out_name}.glb"))
    mn, mx = world_bounds(meshes())
    print("  size", [round(x, 3) for x in (mx - mn)], "parts", [o.name for o in meshes()])
    return True


def make_barrel(path, color=(0.83, 0.27, 0.16)):
    clear_scene()
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.48, depth=1.15, location=(0, 0, 0.575))
    barrel = bpy.context.active_object
    barrel.name = "barrel"
    mat = bpy.data.materials.new("BarrelMat")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.55
    barrel.data.materials.append(mat)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.50, depth=0.12, location=(0, 0, 0.72))
    band = bpy.context.active_object
    band.name = "band"
    mat2 = bpy.data.materials.new("BandMat")
    mat2.use_nodes = True
    mat2.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (1, 0.9, 0.4, 1)
    band.data.materials.append(mat2)
    export_glb(path)


def make_crate(path):
    src = os.path.join(KENNEY, "box.glb")
    clear_scene()
    if os.path.isfile(src):
        bpy.ops.import_scene.gltf(filepath=src)
        ms = meshes()
        mn, mx = world_bounds(ms)
        longest = max(*(mx - mn), 0.01)
        s = 1.25 / longest
        root = bpy.data.objects.new("Root", None)
        bpy.context.collection.objects.link(root)
        for o in ms:
            if o.parent is None:
                o.parent = root
        root.scale = (s, s, s)
        bpy.context.view_layer.update()
        mn, mx = world_bounds(meshes())
        root.location -= Vector(((mn.x + mx.x) * 0.5, (mn.y + mx.y) * 0.5, mn.z))
        bpy.context.view_layer.update()
        apply_transforms([root] + meshes())
        for o in meshes():
            o.parent = None
        bpy.data.objects.remove(root, do_unlink=True)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1.25, location=(0, 0, 0.625))
    export_glb(path)


def copy_debris():
    items = [
        ("debris-bumper.glb", 0.7),
        ("debris-door.glb", 0.7),
        ("debris-door-window.glb", 0.65),
        ("debris-plate-a.glb", 0.45),
        ("debris-plate-b.glb", 0.45),
        ("debris-spoiler-a.glb", 0.5),
        ("debris-tire.glb", 0.55),
        ("cone.glb", 0.7),
    ]
    for name, target in items:
        src = os.path.join(KENNEY, name)
        if not os.path.isfile(src):
            continue
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=src)
        ms = meshes()
        mn, mx = world_bounds(ms)
        longest = max(*(mx - mn), 0.01)
        s = target / longest
        for o in ms:
            o.scale *= s
        apply_transforms(ms)
        mn, mx = world_bounds(meshes())
        for o in meshes():
            o.location -= Vector(((mn.x + mx.x) * 0.5, (mn.y + mx.y) * 0.5, mn.z))
        apply_transforms(meshes())
        out_dir = OUT_DEBRIS if name.startswith("debris") else OUT_PROPS
        export_glb(os.path.join(out_dir, name))


def main():
    os.makedirs(OUT_CARS, exist_ok=True)
    os.makedirs(OUT_PROPS, exist_ok=True)
    os.makedirs(OUT_DEBRIS, exist_ok=True)
    ok = 0
    for car_id, (src, tint) in CAR_MAP.items():
        if process_car(car_id, src, tint):
            ok += 1
    for style, (src, tint) in STYLE_MAP.items():
        process_car(f"style-{style}", src, tint)
    make_barrel(os.path.join(OUT_PROPS, "barrel.glb"))
    make_barrel(os.path.join(OUT_PROPS, "barrel-blue.glb"), color=(0.27, 0.53, 0.80))
    make_crate(os.path.join(OUT_PROPS, "crate.glb"))
    copy_debris()
    print(f"DONE cars_ok={ok}")


if __name__ == "__main__":
    main()
