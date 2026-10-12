class_name QuestDirector
extends RefCounted
## 次の目標とイベント条件（仕様 §14.2 QuestDirector）。
## 保存されたフラグだけから目標を決めるので、ロード後も同じ表示になる。
## 返り値: { "title": 目標, "sub": 補足, "target": 目標マーカーの対象ID }


static func objective(era: int) -> Dictionary:
	var t := TimelineState
	match era:
		TimelineState.ERA_FUTURE:
			if not t.intro_done:
				return _o("閉じていく道から逃げよう", "ルートが通路を閉鎖している", "intro_goal")
			if not t.met_sora:
				return _o("開いた保守路へ向かおう", "閉じていたはずの通路に誰かいる", "sora")
			if not t.is_robot_combat_cleared():
				return _o("警備ロボを停止させよう（%d/%d）" % [t.robots_defeated, TimelineState.ROBOTS_TOTAL],
						"盾をクローで引きはがして攻撃", "robots")
			return _o("セントラルタワーを目指そう", "ナンバタウンの新しいルートから向かおう", "goal")
		TimelineState.ERA_PRESENT:
			if not t.met_matsui:
				return _o("なんばを調べよう", "水路沿いに誰かいる", "matsui")
			if not t.gate_repaired:
				return _o("IDOマーカーをスキャンする", "水路沿いの石の標識を F で調べよう", "ido")
			if not t.drawing_confirmed:
				return _o("旧水門跡の記録を確かめよう", "IDOの隣の展示が変わっている", "exhibit")
			return _o("異次元拠点へ向かおう", "光の扉から未来の座標を復元しよう", "hub_portal")
		TimelineState.ERA_EDO:
			if not t.met_genbei:
				return _o("からくり人形を追いかけよう", "仕掛け横丁で源兵衛をたずねよう", "genbei")
			if not t.gear_placed:
				return _o("外れた大歯車を水門の軸へ戻そう", "NMクローでつかんで運ぶ", "gear")
			if not t.gate_repaired:
				return _o("大歯車を支えて、水門を直そう", "源兵衛の調整とおはるの合図を待つ", "gate_gear")
			return _o("帰還地点から2026年へ戻ろう", "光の輪で F", "return_point")
		TimelineState.ERA_HUB:
			if t.drawing_confirmed:
				return _o("2086年へ戻ろう", "回復と装備を整えたら未来への扉へ", "future_gate")
			return _o("最後のチェックポイントへ戻ろう", "2026年への扉", "present_gate")
	return _o("", "", "")


static func _o(title: String, sub: String, target: String) -> Dictionary:
	return {"title": title, "sub": sub, "target": target}
