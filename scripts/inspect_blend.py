import bpy, json

out = {"scene": bpy.context.scene.name, "objects": [], "collections": [], "cameras": [], "materials": []}

for o in bpy.data.objects:
    out["objects"].append({
        "name": o.name,
        "type": o.type,
        "parent": o.parent.name if o.parent else None,
        "loc": [round(c, 2) for c in o.location],
        "dims": [round(c, 2) for c in o.dimensions],
        "collections": [c.name for c in o.users_collection],
        "hide": o.hide_get(),
    })

for c in bpy.data.collections:
    out["collections"].append({
        "name": c.name,
        "objects": [o.name for o in c.objects],
        "children": [ch.name for ch in c.children],
    })

out["cameras"] = [o.name for o in bpy.data.objects if o.type == "CAMERA"]
out["materials"] = [m.name for m in bpy.data.materials][:60]
out["num_objects"] = len(bpy.data.objects)

print("SCENEDUMP_START")
print(json.dumps(out, indent=1))
print("SCENEDUMP_END")
