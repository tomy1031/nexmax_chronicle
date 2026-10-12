extends Node3D
## 単純な動き（回転・上下の揺れ・周回）を付ける入れ物。タイトル・異次元拠点・クロー練習場で共用。
## 子ノードに見た目を入れて使う。class_name は付けず preload で使う。

## 毎秒の回転量（ラジアン）
var spin := Vector3.ZERO
## 上下の揺れ（振幅 m・速さ）
var bob_amp := 0.0
var bob_speed := 1.0
## 周回（中心からの半径・毎秒の角速度）。orbit_radius > 0 で有効
var orbit_center := Vector3.ZERO
var orbit_radius := 0.0
var orbit_speed := 0.0
var orbit_angle := 0.0
## 周回中に中心へ背を向ける（画面を外へ向ける）
var face_out := false
## 直線の往復移動（from → to を period 秒で往復）。period > 0 で有効
var path_from := Vector3.ZERO
var path_to := Vector3.ZERO
var path_period := 0.0

var _t := 0.0
var _base := Vector3.ZERO


func _ready() -> void:
	_base = position
	_t = randf() * 10.0


func _process(delta: float) -> void:
	_t += delta
	if spin != Vector3.ZERO:
		rotation += spin * delta
	var p := _base
	if orbit_radius > 0.0:
		orbit_angle += orbit_speed * delta
		p = orbit_center + Vector3(sin(orbit_angle) * orbit_radius, _base.y - orbit_center.y, cos(orbit_angle) * orbit_radius)
		if face_out:
			rotation.y = orbit_angle
	if path_period > 0.0:
		var k := 0.5 - 0.5 * cos(_t / path_period * TAU)
		p = path_from.lerp(path_to, k)
	if bob_amp > 0.0:
		p.y += sin(_t * bob_speed) * bob_amp
	position = p
