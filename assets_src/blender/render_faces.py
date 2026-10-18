# blender -b -P render_faces.py -- <glb> <out_prefix>
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
# bbox in world
mn = mathutils.Vector((1e9, 1e9, 1e9)); mx = -mn
for o in objs:
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        mn = mathutils.Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
        mx = mathutils.Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
h = mx.z - mn.z
cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
print('BBOX', tuple(round(v, 3) for v in mn), tuple(round(v, 3) for v in mx))
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.film_transparent = False
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.82, 0.86, 0.92, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
def light(name, rot, energy):
    l = bpy.data.lights.new(name, 'SUN'); l.energy = energy
    ob = bpy.data.objects.new(name, l); scene.collection.objects.link(ob)
    ob.rotation_euler = rot
light('key', (math.radians(50), 0, math.radians(30)), 3.0)
light('fill', (math.radians(70), 0, math.radians(-120)), 1.2)
cam = bpy.data.cameras.new('cam'); cam.lens = 85
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co); scene.camera = co
# glTF import: +Y up in glTF -> Blender Z up; Tripo faces +z(glTF) -> -Y in Blender
head_z = mx.z - h * 0.11
views = {'front': (0, -1), 'q34': (0.55, -0.83), 'full': (0, -1)}
for name, (dx, dy) in views.items():
    if name == 'full':
        target = mathutils.Vector((cx, cy, mn.z + h * 0.5)); dist = h * 3.2
    else:
        target = mathutils.Vector((cx, cy, head_z)); dist = h * 1.05
    co.location = target + mathutils.Vector((dx * dist, dy * dist, 0.02 * h))
    d = target - co.location
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = f'{out}_{name}.png'
    bpy.ops.render.render(write_still=True)
print('DONE')
