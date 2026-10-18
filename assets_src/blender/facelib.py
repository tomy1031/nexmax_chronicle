# 顔の修正に使う共通処理（Blender 内で実行）
import bpy, bmesh, math, mathutils
import numpy as np
from mathutils.bvhtree import BVHTree

def load(glb):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    # 変換を焼き込んで、ローカル＝ワールドにする
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    img = [i for i in bpy.data.images if i.size[0] > 0][0]
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
    return obj, img, px

class Projector:
    """正面（-Y から +Y を見る）から当てて、当たった所のテクスチャ座標と色を返す"""
    def __init__(self, obj, px):
        self.obj = obj
        self.me = obj.data
        self.px = px
        self.H, self.W = px.shape[0], px.shape[1]
        self.bvh = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
        self.uv = self.me.uv_layers.active.data
        self.me.calc_loop_triangles()
        # ポリゴン → ループ三角形（BVH の index は polygon index）
        self.tris_by_poly = {}
        for lt in self.me.loop_triangles:
            self.tris_by_poly.setdefault(lt.polygon_index, []).append(lt)

    def hit(self, x, z):
        loc, nrm, idx, d = self.bvh.ray_cast(mathutils.Vector((x, -5.0, z)), mathutils.Vector((0, 1, 0)))
        if loc is None:
            return None
        return loc, nrm, idx

    def uv_at(self, loc, poly):
        me = self.me
        for lt in self.tris_by_poly.get(poly, []):
            vs = [me.vertices[i].co for i in lt.vertices]
            # 三角形の中か（重心座標）
            uvs = [self.uv[l].uv for l in lt.loops]
            p = mathutils.geometry.closest_point_on_tri(loc, *vs)
            if (p - loc).length < 1e-4:
                bc = mathutils.geometry.barycentric_transform(loc, vs[0], vs[1], vs[2], mathutils.Vector((1,0,0)), mathutils.Vector((0,1,0)), mathutils.Vector((0,0,1)))
                u = uvs[0].x * bc.x + uvs[1].x * bc.y + uvs[2].x * bc.z
                v = uvs[0].y * bc.x + uvs[1].y * bc.y + uvs[2].y * bc.z
                return u, v
        return None

    def color(self, u, v):
        x = min(self.W - 1, max(0, int(u * self.W)))
        y = min(self.H - 1, max(0, int(v * self.H)))
        return self.px[y, x, :3]

def bbox(obj):
    vs = np.array([v.co[:] for v in obj.data.vertices])
    return vs.min(0), vs.max(0)
