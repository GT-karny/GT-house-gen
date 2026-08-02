# 日本の町工場・整備工場・貸しガレージ生成設計

## 0. 参考画像インデックス

画像自体は権利関係を混在させず、参照ページと観察点を記録する。

| 類型 | 参考 | 観察する要素 |
|---|---|---|
| 都市型町工場 | [東大阪市渋川町の工場](https://urisokokojosearch.jp/rent/28574) | 狭い接道、角波外壁、連続シャッター、露出配管 |
| 都市型町工場 | [尼崎市の工場](https://www.latteestate.co.jp/biz/room-75377/) | 切妻屋根、欄間窓、錆・退色、自転車 |
| 整備工場 | [国交省東北運輸局：自動車整備工場の案内](https://wwwtb.mlit.go.jp/tohoku/fs/pdf-file/fs-789.pdf) | 作業場・車両置場の関係、必要寸法例 |
| 貸しガレージ | [SKガレジオ小林I](https://tokyo-garage.jp/rent/inzai-kobayashi/) | 反復住戸、2.60×6.15mガレージ、2.44×2.40m開口 |
| シャッター | [一般的なガレージシャッター寸法](https://www.yokobiki-shutter.co.jp/column/garage-shutter-width-2/) | 1台用幅2.4–2.7m、高さ2.0–2.4m |
| 鋸屋根 | [桐生のノコギリ屋根工場](https://www.kiryucci.or.jp/nokogiri.houkoku/10.3syou.pdf) | 反復する北面採光、工場景観のシルエット |

## 1. 建物構成要素

- 共通：鉄骨/木造フレーム、土間、角波・波板外壁、シャッター、欄間窓、庇、雨樋、縦樋、外付け電気/ガスメーター、看板。
- 町工場：小さな事務所、製作ベイ、材料棚、増築下屋、換気扇、集塵/ダクト、錆・補修板。
- 整備工場：整備ベイ、2柱リフト、工具キャビネット、タイヤラック、油脂ドラム、コンプレッサー、洗車/車両置場、受付。
- 貸しガレージ：同寸ユニット反復、各戸シャッター、戸境壁、番号札、電源、車止め。2階付きは住戸窓・外廊下・階段を追加する。

## 2. 外構要素

- 道路切下げ、アスファルト/コンクリート前庭、車両旋回域、来客/待機車両、白線。
- メッシュフェンス、引戸門扉、単管バリケード、ボラード、カーブミラー、外灯、防犯カメラ。
- 自販機、室外機、廃材/パレット、タイヤ、ドラム缶、ゴミ箱、自転車、軽トラック。
- 雑草、側溝、グレーチング、電柱・引込線、隣接住宅との狭い隙間。

## 3. パラメータツリー

```text
FactoryConfig
├─ identity: seed, archetype
├─ lot: width, depth, sideSetback, frontYardDepth
├─ building: width, depth, clearHeight, floors
│  ├─ roof: form, pitch
│  └─ appearance: weathering
├─ bayGrammar: unitWidth, unitCount, officeRatio, shutterOpenRate
├─ operation: equipmentDensity
└─ boundary: fence
```

生成順序は `敷地座標系 → 建物パッド → ベイ割り → 正面モジュール → 屋根 → 作業設備 → 外構`。ベイ幅は敷地に収まる最大数へクランプし、同じseedでは開閉状態と設備配置が変わらない。`src/factory/gen/` はThree.js非依存で、UE移植時は構造体と配置インスタンスへ直写できる。

## 4. Blender部品パック

初期パックはローラーシャッター、2柱リフト、タイヤラック、ドラム缶、ボラードを実寸メートルで作る。原点は接地中心、+Z上、命名は `SM_Factory_*`。FBXは個別オブジェクト、GLBはWeb表示用の一括パックとする。

## 5. GUI統合

`factory.html` を独立エントリにし、業態プリセット、敷地、建物、ベイ/開口、経年、設備密度を即時再生成する。法令適合を保証するものではないため、将来 `visual` と `certified-layout` の検証モードを分ける。
