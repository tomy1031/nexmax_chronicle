class_name CharacterBuilder
extends RefCounted
## 登場人物の見た目を簡易形状で組み立てる。原点は足元、前方は -Z。
## build() が返すノードは animate(delta: float, moving: bool, anim: String) を持つ（Npc が毎フレーム呼ぶ）。
## 各キャラの形と動きは scripts/npc/models/*.gd（共通部分は chibi_base.gd）。
## 対応アニメ: "idle" / "walk" / "wave" / "hammer" / "point" / "cheer" / "fan_wait" / "fan_go" / "sit" / "work"
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

const MODELS := {
	"genbei": preload("res://scripts/npc/models/genbei_model.gd"),
	"oharu": preload("res://scripts/npc/models/oharu_model.gd"),
	"matsui": preload("res://scripts/npc/models/matsui_model.gd"),
	"sora": preload("res://scripts/npc/models/sora_model.gd"),
	"villager": preload("res://scripts/npc/models/villager_model.gd"),
	"boatman": preload("res://scripts/npc/models/boatman_model.gd"),
	"doll": preload("res://scripts/npc/models/doll_model.gd"),
	"citizen": preload("res://scripts/npc/models/citizen_model.gd"),
	"helper_bot": preload("res://scripts/npc/models/helper_bot_model.gd"),
}


static func display_name(kind: String) -> String:
	return NAMES.get(kind, kind)


## kind の見た目を作って返す（形はこの場で組み立て済み）。知らない kind は通行人の見た目にする。
static func build(kind: String) -> Node3D:
	var script: GDScript = MODELS.get(kind, MODELS["citizen"])
	var root: Node3D = script.new()
	root.name = "Model_%s" % kind
	root.call("construct")
	return root
