import bpy, os, math
from mathutils import Vector
from mathutils.kdtree import KDTree

OUTDIR = os.environ.get("SEATED_OUT", "/tmp/seated_out")
os.makedirs(OUTDIR, exist_ok=True)

# rig key -> (source rigged mesh, armature)
RIGS = {
    "f": ("Police officer michelle copy", "Rigged Michelle"),
    "m": ("burglar copy", "Rigged Burglar"),
}
# agent -> (cast mesh, rig key)   [body type: width 1.50 = female rig, 1.56+ = male rig]
AGENTS = {
    "intake":    ("Betty Newbie",     "f"),
    "entities":  ("Bob Newbie",       "m"),
    "gmail":     ("Bella Goth",       "f"),
    "synthesis": ("chris roomies",    "f"),
    "recommend": ("mortimer Goth",    "m"),
    "pack":      ("Michael Bachelor", "m"),
}

scene = bpy.context.scene
try: scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception: scene.render.engine = "BLENDER_EEVEE"
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.resolution_x = 480; scene.render.resolution_y = 640

cam_data = bpy.data.cameras.new("RenderCam"); cam_data.type = "ORTHO"
cam = bpy.data.objects.new("RenderCam", cam_data)
scene.collection.objects.link(cam); scene.camera = cam
sun_data = bpy.data.lights.new("RenderSun", "SUN"); sun_data.energy = 3.5
sun = bpy.data.objects.new("RenderSun", sun_data)
scene.collection.objects.link(sun)
keepers = {cam, sun}


def transfer_weights(target, source):
    src_me = source.data
    src_groups = {vg.index: vg.name for vg in source.vertex_groups}
    kd = KDTree(len(src_me.vertices))
    for i, v in enumerate(src_me.vertices):
        kd.insert(v.co, i)
    kd.balance()
    name_to_vg = {}
    for gname in src_groups.values():
        name_to_vg[gname] = target.vertex_groups.get(gname) or target.vertex_groups.new(name=gname)
    for tv in target.data.vertices:
        _, idx, _ = kd.find(tv.co)
        for g in src_me.vertices[idx].groups:
            gname = src_groups.get(g.group)
            if gname:
                name_to_vg[gname].add([tv.index], g.weight, "REPLACE")


def bind_like(target, source, armature):
    target.parent = source.parent
    target.parent_type = source.parent_type
    target.matrix_parent_inverse = source.matrix_parent_inverse.copy()
    target.matrix_basis = source.matrix_basis.copy()
    target.modifiers.new("Armature", "ARMATURE").object = armature


def set_rot(arm, bone, x_deg):
    pb = arm.pose.bones.get(bone); pb.rotation_mode = "XYZ"
    pb.rotation_euler = (math.radians(x_deg), 0, 0)


def seated(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"; pb.rotation_euler = (0, 0, 0)
    for b in ("Left thigh", "Right thigh"): set_rot(arm, b, 75)
    for b in ("Left Shin", "Right Shin"): set_rot(arm, b, -85)
    set_rot(arm, "spine1", -12)


def world_bbox(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    pts = [obj.matrix_world @ Vector(c) for c in ev.bound_box]
    xs=[v.x for v in pts]; ys=[v.y for v in pts]; zs=[v.z for v in pts]
    center = Vector(((min(xs)+max(xs))/2,(min(ys)+max(ys))/2,(min(zs)+max(zs))/2))
    size = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))
    return center, size


# Build all seated meshes, sharing one posed armature per rig
seated_objs = {}
for key, (cast, rk) in AGENTS.items():
    sname, aname = RIGS[rk]
    src = bpy.data.objects[sname]; arm = bpy.data.objects[aname]
    orig = bpy.data.objects[cast]
    T = orig.copy(); T.data = orig.data.copy(); T.name = f"{key} seated"
    scene.collection.objects.link(T)
    transfer_weights(T, src)
    bind_like(T, src, arm)
    seated_objs[key] = T

for _, (sname, aname) in RIGS.items():
    seated(bpy.data.objects[aname])
bpy.context.view_layer.update()

# Common ortho scale for uniform sizing across the cast
sizes = {k: world_bbox(o) for k, o in seated_objs.items()}
gsize = max(s for _, s in sizes.values())
ortho = gsize * 1.18

for key, T in seated_objs.items():
    center, _ = sizes[key]
    d = gsize * 2.4
    cam.location = center + Vector((d*0.85, -d, d*0.65))
    cam.rotation_euler = (center-cam.location).to_track_quat("-Z","Y").to_euler()
    cam.data.ortho_scale = ortho
    sun.location = center + Vector((d,-d,d*1.6))
    for o in bpy.data.objects:
        if o in keepers: continue
        o.hide_render = (o is not T)
    scene.render.filepath = os.path.join(OUTDIR, key + ".png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", key, "<-", AGENTS[key][0])

print("DONE_SEATED")
