import bpy, json

out = {"armatures": [], "meshes": [], "empties": [], "other": []}

for o in bpy.data.objects:
    rec = {
        "name": o.name,
        "type": o.type,
        "parent": o.parent.name if o.parent else None,
        "parent_type": o.parent_type if o.parent else None,
        "parent_bone": getattr(o, "parent_bone", "") or None,
        "loc": [round(c, 2) for c in o.location],
        "dims": [round(c, 2) for c in o.dimensions],
    }
    if o.type == "ARMATURE":
        arm = o.data
        rec["bones"] = [b.name for b in arm.bones]
        rec["pose_bones"] = [pb.name for pb in o.pose.bones] if o.pose else []
        out["armatures"].append(rec)
    elif o.type == "MESH":
        mods = []
        for m in o.modifiers:
            md = {"type": m.type, "name": m.name}
            if m.type == "ARMATURE":
                md["object"] = m.object.name if m.object else None
            mods.append(md)
        rec["modifiers"] = mods
        rec["vertex_groups"] = [vg.name for vg in o.vertex_groups][:40]
        out["meshes"].append(rec)
    elif o.type == "EMPTY":
        out["empties"].append(rec)
    else:
        out["other"].append(rec)

print("RIGDUMP_START")
print(json.dumps(out, indent=1))
print("RIGDUMP_END")
