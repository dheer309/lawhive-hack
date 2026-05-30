import bpy, os, math
from mathutils import Vector

# agent -> Sims character
CHARS = {
    "intake": "Betty Newbie",
    "entities": "Bob Newbie",
    "gmail": "Bella Goth",
    "synthesis": "chris roomies",
    "recommend": "mortimer Goth",
    "pack": "Michael Bachelor",
}
OUTDIR = "/Users/foomingli/Documents/Lawhive-hackathon/public/characters"
os.makedirs(OUTDIR, exist_ok=True)

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.resolution_x = 480
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100

# render camera (orthographic)
cam_data = bpy.data.cameras.new("RenderCam")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("RenderCam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

# our own sun so the isolated character is lit
sun_data = bpy.data.lights.new("RenderSun", "SUN")
sun_data.energy = 3.5
sun = bpy.data.objects.new("RenderSun", sun_data)
scene.collection.objects.link(sun)

keepers = {cam, sun}
all_objs = list(bpy.data.objects)


def render_one(target, out):
    orig_rot = target.rotation_euler.copy()
    # stand the model up: its height runs along world Y, rotate so it runs along Z
    target.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.view_layer.update()

    bb = [target.matrix_world @ Vector(c) for c in target.bound_box]
    xs = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
    center = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
    size = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))

    d = size * 2.4
    cam.location = center + Vector((d * 0.85, -d, d * 0.65))  # front-right, slightly above
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = size * 1.2
    sun.location = center + Vector((d, -d, d * 1.6))

    for o in all_objs:
        if o in keepers:
            continue
        o.hide_render = (o is not target)

    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    target.rotation_euler = orig_rot


for key, name in CHARS.items():
    obj = bpy.data.objects.get(name)
    if not obj:
        print("MISSING", key, name)
        continue
    render_one(obj, os.path.join(OUTDIR, key + ".png"))
    print("RENDERED", key, "<-", name)

print("DONE_RENDER")
