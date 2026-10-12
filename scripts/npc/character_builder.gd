class_name CharacterBuilder
extends RefCounted
## 登場人物の見た目を簡易形状で組み立てる。原点は足元、前方は -Z。
## build() が返すノードは、任意で animate(delta: float, moving: bool, anim: String) を持てる（Npc が毎フレーム呼ぶ）。
##
## kind 一覧:
##   "genbei"   源兵衛（1726・からくり職人。白髪・白ひげ・額にゴーグル・藍の着物・白い前掛け）
##   "oharu"    おはる（1726・少女。桃色の着物・髪をお団子に赤いリボン・手に団扇）
##   "matsui"   マツイ社長（2026・黒髪で前髪あり・丸顔・笑顔・黒のジャケットに白Tシャツ・黒っぽいズボン。眼鏡なし）
##   "sora"     ソラ（2086・少女。茶色のポニーテールに赤いリボン・白とオレンジのスーツ・背中に小型ジェット）
##   "villager" 町人（1726・茶の着物・笠）
##   "boatman"  船頭（1726・笠・はっぴ。舟に座る想定）
##   "doll"     茶運びからくり人形（1726・小さな木製人形、お盆を持つ）
##   "citizen"  通行人（2026）
##   "helper_bot" 整備ボット（拠点・白い小型ロボ）

const NAMES := {
	"genbei": "源兵衛",
	"oharu": "おはる",
	"matsui": "マツイ社長",
	"sora": "ソラ",
	"villager": "町人",
	"boatman": "船頭",
	"doll": "からくり人形",
	"citizen": "通行人",
	"helper_bot": "整備ボット",
}


static func display_name(kind: String) -> String:
	return NAMES.get(kind, kind)


## 仮の見た目（詳細なモデルは差し替え予定）。
static func build(kind: String) -> Node3D:
	var root := Node3D.new()
	root.name = "Model_%s" % kind
	var colors := {
		"genbei": Color(0.2, 0.25, 0.45), "oharu": Color(0.95, 0.55, 0.65),
		"matsui": Color(0.12, 0.12, 0.14), "sora": Color(0.95, 0.95, 0.95),
		"villager": Color(0.5, 0.35, 0.25), "boatman": Color(0.3, 0.35, 0.5),
		"doll": Color(0.75, 0.55, 0.35), "citizen": Color(0.4, 0.5, 0.6),
		"helper_bot": Color(0.95, 0.95, 0.95),
	}
	var c: Color = colors.get(kind, Color.GRAY)
	var h := 0.55 if kind == "doll" or kind == "helper_bot" else (1.15 if kind == "oharu" or kind == "sora" else 1.45)
	var body := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = h * 0.22
	cap.height = h * 0.7
	body.mesh = cap
	body.position = Vector3(0, h * 0.35, 0)
	body.material_override = LevelKit.char_mat(c)
	root.add_child(body)
	var head := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = h * 0.2
	sm.height = h * 0.4
	head.mesh = sm
	head.position = Vector3(0, h * 0.82, 0)
	head.material_override = LevelKit.char_mat(Color(1.0, 0.85, 0.72))
	root.add_child(head)
	return root
