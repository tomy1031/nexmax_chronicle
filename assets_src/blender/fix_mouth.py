# blender -b -P fix_mouth.py -- <in.glb> <out.glb> <debug_prefix> [smile_scale] [line_scale]
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from facelib import *
argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, dbg = argv[0], argv[1], argv[2]
smile_k = float(argv[3]) if len(argv) > 3 else 1.0
line_k = float(argv[4]) if len(argv) > 4 else 1.0
obj, img, px = load(src)
P = Projector(obj, px)
mn, mx = bbox(obj)
cx = (mn[0] + mx[0]) / 2
ztop = mx[2]

# ---- 1. 正面の格子で口を探す（赤い唇・口の中の連結成分のうち、中央に近くいちばん下のもの）
N = 240
xs = np.linspace(cx - 0.11, cx + 0.11, N)
zs = np.linspace(ztop - 0.32, ztop - 0.06, int(N * 0.26 / 0.22))
dx = xs[1] - xs[0]
G = np.zeros((len(zs), len(xs), 3), np.float32)
D = np.full((len(zs), len(xs)), np.nan, np.float32)
for j, z in enumerate(zs):
    for i, x in enumerate(xs):
        h = P.hit(x, z)
        if not h: continue
        uv = P.uv_at(h[0], h[2])
        if not uv: continue
        G[j, i] = P.color(*uv)
        D[j, i] = h[0].y
r, g, b = G[..., 0], G[..., 1], G[..., 2]
red = (r > 0.3) & (r > g * 1.6) & (r > b * 1.5)
# 連結成分（4 近傍）
lab = np.zeros(red.shape, np.int32)
comps = []
k = 0
for j in range(red.shape[0]):
    for i in range(red.shape[1]):
        if red[j, i] and lab[j, i] == 0:
            k += 1
            st = [(j, i)]; lab[j, i] = k; pts = []
            while st:
                a, c = st.pop(); pts.append((a, c))
                for aa, cc in ((a+1,c),(a-1,c),(a,c+1),(a,c-1)):
                    if 0 <= aa < red.shape[0] and 0 <= cc < red.shape[1] and red[aa, cc] and lab[aa, cc] == 0:
                        lab[aa, cc] = k; st.append((aa, cc))
            if len(pts) >= 12:
                pts = np.array(pts)
                comps.append((k, pts))
best = None
for k, pts in comps:
    px0, px1 = xs[pts[:, 1]].min(), xs[pts[:, 1]].max()
    mxc = xs[pts[:, 1]].mean()
    # 口は顔の中心線をまたぎ、横に長い。いちばん大きいものを選ぶ（目は左右に分かれているので外れる）
    if not (px0 < cx < px1) or abs(mxc - cx) > 0.03: continue
    if best is None or len(pts) > best[0]:
        best = (len(pts), pts)
pts = best[1]
x0, x1 = xs[pts[:, 1]].min(), xs[pts[:, 1]].max()
z0, z1 = zs[pts[:, 0]].min(), zs[pts[:, 0]].max()
# 歯（白）も含めるため少し広げる
mxc, mzc = (x0 + x1) / 2, (z0 + z1) / 2
A = (x1 - x0) / 2 + dx * 3
B = (z1 - z0) / 2 + dx * 3
print('MOUTH', round(mxc, 4), round(mzc, 4), 'half', round(A, 4), round(B, 4))

# ---- 2. 肌の色（口の左右と上の頬から中央値）
samp = []
for sx, sz in ((-1.6, 0.3), (1.6, 0.3), (-1.3, 1.6), (1.3, 1.6), (0, 2.2)):
    x = mxc + sx * A; z = mzc + sz * B
    j = int(round((z - zs[0]) / (zs[1] - zs[0]))); i = int(round((x - xs[0]) / dx))
    if 0 <= j < len(zs) and 0 <= i < len(xs) and G[j, i].sum() > 0: samp.append(G[j, i])
skin = np.median(np.array(samp), axis=0)
print('SKIN', skin.round(3))


ell = lambda x, z: math.hypot((x - mxc) / A, (z - mzc) / B)
me = obj.data
yfront = np.nanmin(D)
# ---- 3. 周りの頬からなめらかな面を当てはめる
bm = bmesh.new(); bm.from_mesh(me)
bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
ring = [v for v in bm.verts if 1.25 < ell(v.co.x, v.co.z) < 2.2 and v.co.y < yfront + 0.06 and v.normal.y < -0.2]
Mx = np.array([[1, v.co.x - mxc, v.co.z - mzc, (v.co.x - mxc) ** 2, (v.co.z - mzc) ** 2, (v.co.x - mxc) * (v.co.z - mzc)] for v in ring])
coef = np.linalg.lstsq(Mx, np.array([v.co.y for v in ring]), rcond=None)[0]
surf = lambda x, z: float(np.dot(coef, [1, x - mxc, z - mzc, (x - mxc) ** 2, (z - mzc) ** 2, (x - mxc) * (z - mzc)]))

# ---- 4. 正面から見た絵（口を周りの肌で埋め、笑みの線を描いたもの）を先に作る（形を変える前の色で）
R = 2.4
hx = np.linspace(mxc - A * R, mxc + A * R, 300)
hz = np.linspace(mzc - B * R * 1.4, mzc + B * R * 1.4, int(300 * (B * 1.4) / A) + 1)
G2 = np.zeros((len(hz), len(hx), 3), np.float32); ok = np.zeros((len(hz), len(hx)), bool)
for j, z in enumerate(hz):
    for i, x in enumerate(hx):
        h = P.hit(x, z)
        if not h: continue
        uv = P.uv_at(h[0], h[2])
        if not uv: continue
        G2[j, i] = P.color(*uv); ok[j, i] = True
XX, ZZ = np.meshgrid(hx, hz)
EE = np.hypot((XX - mxc) / A, (ZZ - mzc) / B)
mask = (EE < 1.5) | (~ok & (EE < 2.6))
img2 = G2.copy(); img2[mask] = skin
for _ in range(700):
    avg = (np.roll(img2, 1, 0) + np.roll(img2, -1, 0) + np.roll(img2, 1, 1) + np.roll(img2, -1, 1)) / 4
    img2[mask] = avg[mask]
smile_w = A * 0.5 * smile_k; smile_c = mzc - B * 0.05; smile_up = B * 0.38 * smile_k
lw = max(0.0013, A * 0.085) * line_k
line_col = np.array([0.50, 0.24, 0.22]) * 0.9 + skin * 0.1
T = (XX - mxc) / smile_w; ZC = smile_c + smile_up * T * T; dd = np.abs(ZZ - ZC)
fade = 1 - np.clip((np.abs(T) - 0.85) / 0.23, 0, 1)
al = (1 - np.clip((dd - lw * 0.6) / (lw * 0.8), 0, 1)) * fade * (np.abs(T) < 1.08)
img2 = img2 * (1 - al[..., None]) + line_col * al[..., None]
def sample(x, z):
    fi = (x - hx[0]) / (hx[1] - hx[0]); fj = (z - hz[0]) / (hz[1] - hz[0])
    i0 = int(np.clip(np.floor(fi), 0, len(hx) - 2)); j0 = int(np.clip(np.floor(fj), 0, len(hz) - 2))
    ti = float(np.clip(fi - i0, 0, 1)); tj = float(np.clip(fj - j0, 0, 1))
    return img2[j0, i0] * (1 - ti) * (1 - tj) + img2[j0, i0 + 1] * ti * (1 - tj) + img2[j0 + 1, i0] * (1 - ti) * tj + img2[j0 + 1, i0 + 1] * ti * tj

# ---- 5. 口のまわり（唇・歯・口の中）を面より少し奥へ押し込み、その上に薄い「顔の当て布」を貼る
#         （穴をあけないので輪郭線が乱れない。押し込んだ部分とその輪郭線は当て布の後ろに隠れる）
PATCH = 1.3
for v in bm.verts:
    e = ell(v.co.x, v.co.z)
    if e > PATCH + 0.15: continue
    t = surf(v.co.x, v.co.z)
    if not (t - 0.035 < v.co.y < t + 0.16): continue
    if e <= PATCH:
        v.co.y = max(v.co.y, t + 0.012)
    else:
        k = (e - PATCH) / 0.15
        v.co.y = max(v.co.y, (t + 0.012) * (1 - k) + v.co.y * k)
bm.normal_update()
NR, NS = 9, 56
newv = []
for ri in range(NR + 1):
    r = PATCH * ri / NR
    row = []
    for si in range(NS if ri else 1):
        th = 2 * math.pi * si / NS
        x = mxc + A * r * math.cos(th); z = mzc + B * r * math.sin(th)
        row.append(bm.verts.new((x, surf(x, z) - 0.0008, z)))
    newv.append(row)
newf = []
for si in range(NS):
    a = newv[1][si]; b = newv[1][(si + 1) % NS]
    newf.append(bm.faces.new((newv[0][0], b, a)))
for ri in range(1, NR):
    for si in range(NS):
        a = newv[ri][si]; b = newv[ri][(si + 1) % NS]; c = newv[ri + 1][(si + 1) % NS]; d = newv[ri + 1][si]
        newf.append(bm.faces.new((a, b, c, d)))
mat_idx = 0
for f in newf:
    f.material_index = mat_idx
    f.smooth = True
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
print('PATCH_FACES', len(newf))
# ---- 6. 新しい面の UV：テクスチャの空いている四角に、正面からの絵を貼る
W, H = img.size
occ = np.zeros((256, 256), bool)
uvl = bm.loops.layers.uv.active
newset = set(newf)
for f in bm.faces:
    if f in newset: continue
    us = [l[uvl].uv.x for l in f.loops]; vs = [l[uvl].uv.y for l in f.loops]
    x0, x1 = int(min(us) * 256), int(max(us) * 256) + 1; y0, y1 = int(min(vs) * 256), int(max(vs) * 256) + 1
    occ[max(0, y0):min(256, y1 + 1), max(0, x0):min(256, x1 + 1)] = True
ps = np.zeros((257, 257), np.int32); ps[1:, 1:] = np.cumsum(np.cumsum(occ.astype(np.int32), 0), 1)
spot = None
for bw in range(40, 11, -2):
    bh = int(bw * (B / A)) + 1
    for y in range(1, 256 - bh):
        for x in range(1, 256 - bw):
            if ps[y + bh, x + bw] - ps[y, x + bw] - ps[y + bh, x] + ps[y, x] == 0:
                spot = (x, y); break
        if spot: break
    if spot: break
print('UV_SPOT', spot, bw, bh)
ux0, uy0 = spot[0] / 256, spot[1] / 256; uw, uh = bw / 256, bh / 256
X0, X1 = mxc - A * PATCH * 1.05, mxc + A * PATCH * 1.05; Z0, Z1 = mzc - B * PATCH * 1.05, mzc + B * PATCH * 1.05
def patch_uv(x, z):
    return ux0 + (x - X0) / (X1 - X0) * uw, uy0 + (z - Z0) / (Z1 - Z0) * uh
for f in newf:
    for l in f.loops:
        u, v = patch_uv(l.vert.co.x, l.vert.co.z)
        l[uvl].uv = (u, v)
patch_ids = set(v.index for row in newv for v in row) if False else None
bm.verts.index_update()
patch_ids = set(v.index for row in newv for v in row)
bm.to_mesh(me); bm.free(); me.update()
# 当て布の法線を、当てはめた面の向きにそろえる（ふちで陰影の輪が出ないように）
def surf_normal(x, z, e=1e-4):
    dfx = (surf(x + e, z) - surf(x - e, z)) / (2 * e); dfz = (surf(x, z + e) - surf(x, z - e)) / (2 * e)
    n = mathutils.Vector((dfx, -1.0, dfz)); n.normalize(); return n
vn = []
for v in me.vertices:
    if v.index in patch_ids:
        vn.append(surf_normal(v.co.x, v.co.z))
    else:
        vn.append(v.normal.copy())
# 当て布のすぐ外側（ell 1.3〜1.6）の顔の頂点も、当てはめた面の向きへなだらかに寄せる
for v in me.vertices:
    if v.index in patch_ids: continue
    e = ell(v.co.x, v.co.z)
    if e < 1.6 and abs(v.co.y - surf(v.co.x, v.co.z)) < 0.02:
        k = 1 - np.clip((e - 1.25) / 0.35, 0, 1)
        vn[v.index] = (v.normal * (1 - k) + surf_normal(v.co.x, v.co.z) * k).normalized()
me.normals_split_custom_set_from_vertices(vn)
me.update()
bpy.context.view_layer.update()

# ---- 7. テクスチャ：空いていた四角に絵を描き、口の周り（残った唇の色）も塗り直す
newpx = px.copy()
tx0, ty0 = int(ux0 * W), int(uy0 * H); tw, th = int(uw * W), int(uh * H)
for ty in range(ty0 - 2, ty0 + th + 3):
    for tx in range(tx0 - 2, tx0 + tw + 3):
        x = X0 + ((tx + 0.5) / W - ux0) / uw * (X1 - X0)
        z = Z0 + ((ty + 0.5) / H - uy0) / uh * (Z1 - Z0)
        newpx[ty, tx, :3] = sample(x, z)
uvd = me.uv_layers.active.data
me.calc_loop_triangles()
cnt = 0
for lt in me.loop_triangles:
    vs = [me.vertices[i].co for i in lt.vertices]
    cen = (vs[0] + vs[1] + vs[2]) / 3
    e = ell(cen.x, cen.z)
    if e < 0.9 or e > 2.0 or abs(cen.y - surf(cen.x, cen.z)) > 0.03 or lt.normal.y > 0.25:
        continue
    uvs = [uvd[l].uv for l in lt.loops]
    if all(ux0 <= u.x <= ux0 + uw and uy0 <= u.y <= uy0 + uh for u in uvs):
        continue
    us = [u.x * W for u in uvs]; vv = [u.y * H for u in uvs]
    a2 = mathutils.Vector((us[0], vv[0], 0)); b2 = mathutils.Vector((us[1], vv[1], 0)); c2 = mathutils.Vector((us[2], vv[2], 0))
    for ty in range(int(min(vv)), int(max(vv)) + 2):
        for tx in range(int(min(us)), int(max(us)) + 2):
            if not (0 <= tx < W and 0 <= ty < H): continue
            bc = mathutils.geometry.barycentric_transform(mathutils.Vector((tx + 0.5, ty + 0.5, 0)), a2, b2, c2, mathutils.Vector((1,0,0)), mathutils.Vector((0,1,0)), mathutils.Vector((0,0,1)))
            if bc.x < -0.03 or bc.y < -0.03 or bc.z < -0.03: continue
            w3 = vs[0] * bc.x + vs[1] * bc.y + vs[2] * bc.z
            ee = ell(w3.x, w3.z)
            m = 1.0 - np.clip((ee - 1.5) / 0.4, 0, 1)
            if m <= 0: continue
            m = m * m * (3 - 2 * m)
            newpx[ty, tx, :3] = px[ty, tx, :3] * (1 - m) + sample(w3.x, w3.z) * m
            cnt += 1
print('RING_TEXELS', cnt)
img.pixels = newpx.ravel(); img.update(); img.pack()
os.makedirs(os.path.dirname(dst), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=92)
print('EXPORTED', dst)
