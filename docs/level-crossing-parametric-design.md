# 日本の踏切プロシージャル生成 — パラメータ調査・設計・実装計画

調査日: 2026-08-01
対象: `house-gen` の既存踏切実装 (`src/env/railway.ts`, `src/viewer/railway.ts`)
目的: 見た目のランダム差分ではなく、「どのような地域で、どのクラスの鉄道と道路が交差するか」という上位条件から、線路・道路・保安設備を決定論的に生成する。

> この文書は景観生成・シミュレーション用の設計資料であり、実物の施工設計や安全認証の仕様書ではない。実施設計には、鉄道事業者の実施基準、道路管理者との協議、適用法令の確認が別途必要となる。

---

## 1. 調査結果の要約

### 実装状況（2026-08-01）

初期スコープのうち、直線道路・直線軌道を対象とする構造生成を実装済み。

- `src/env/crossing/` にThree.js非依存のconfig・型・計画ロジックを分離
- 1～4線、軌間、線路中心間隔、30～90度の交差角（現代法規準拠モードは45～90度）
- 1～4車線、道路幅、住宅側／反対側の歩道・路肩幅
- アスファルト／コンクリート／ゴム踏切舗装
- 第1・3・4種、2基／4基警報機、2遮断／4遮断構成
- 電化・非電化、PC／木まくらぎ、基本／高設備構成
- 任意方向のレール、まくらぎ、踏切舗装、柵、検知器、架線のviewer対応
- GUIからの構造変更と純ロジック・viewer smoke test

曲線線形、カント、道路・線路の縦断勾配、見通し評価、URL状態保存、OpenDRIVE入出力は後続フェーズとして未実装。

踏切は単一の設備アセットではなく、次の3系統の交差としてモデル化する必要がある。

1. **鉄道コリドー**: 線路数、軌間、線路中心間隔、線形、勾配、カント、軌道構造、電化
2. **道路コリドー**: 車線、歩道、路肩、自転車施設、中央帯、線形、縦断・横断勾配
3. **交差・保安システム**: 交差角、踏切舗装、遮断機、警報機、検知装置、停止線、柵、誘導表示

国土交通省の「踏切道安全通行カルテ」は、実在踏切を踏切長、交差角、横断線路数、道路線形、車道・歩道幅員、交通規制、踏切種別、保安設備などで記録している。この項目体系を日本向けスキーマの主な根拠とする。

日本で現存する踏切種別は、次の3種類を基本とする。

| 種別 | 遮断機 | 警報機 | 生成上の扱い |
| --- | --- | --- | --- |
| 第1種 | あり | あり | 現代の原則。必要設備を決めた結果として分類する |
| 第3種 | なし | あり | 130km/h以下かつ鉄道・道路交通量が著しく少ない場合等の例外候補 |
| 第4種 | なし | なし | 歴史的な既設状態の再現専用。現代プリセットからは生成しない |

第2種は一定時間だけ踏切警手が遮断機を操作する種別だが、現在は設置されていないため、初期実装のプリセット対象外とする。

設計上の中心的な判断は次の通り。

- 通常の公開入力は `railwayClass`、`roadClass`、`context`、`history` と `seed` とし、線路数・道路断面・設備構成等をそこから解決する。
- `protectionClass` は原則として入力せず、必要な遮断機・警報機を決めた後に結果分類として算出する。
- 線路数、道路断面、設備構成等の低レベル値は、専門家向け・デバッグ向けの `overrides` として上書き可能にする。
- `seed` は、成立条件を変えない機器箱の左右選択や小物配置に限定して使う。
- 道路幅を単一値にせず、車線・路肩・歩道等の横断構成として保持する。
- 複線以上では線路中心間隔を単一値にせず、隣接線間の配列として保持する。
- 踏切長、舗装ポリゴン、遮断桿長、停止線、柵の開口は入力値から導出する。
- 直角・直線だけでなく、斜角交差と左右非対称な道路断面を最初からデータモデル上で許容する。

---

## 2. 調査資料と設計への反映

### 2.1 日本の公的資料

- [国土交通省「踏切道安全通行カルテ」様式](https://www.mlit.go.jp/report/press/content/001399461.pdf)
  - 踏切長、交差角、横断本数、左右道路の線形、車道・歩道幅員、交通規制、歩車道分離、保安設備などをパラメータ候補へ採用。
- [国土交通省「踏切道の現状」](https://www.mlit.go.jp/road/sisaku/fumikiri/fu_01.html)
  - 第1種、第3種、第4種の設備成立条件を `protectionClass` の制約へ採用。
- [国土交通省「踏切道の課題」](https://www.mlit.go.jp/road/sisaku/fumikiri/fu_02.html)
  - 遮断時間、道路・歩行者交通量、歩道狭隘などを運用・評価パラメータへ採用。
- [国土交通省「道路の移動等円滑化に関するガイドライン」改定概要](https://www.mlit.go.jp/report/press/road01_hh_001742.html)
  - 歩道幅に応じた踏切内誘導表示と、歩道がない・狭い踏切の扱いを歩行者設備の派生規則へ採用。
- [国土交通省「鉄道に関する技術上の基準を定める省令等の解釈基準」](https://www.mlit.go.jp/tetudo/tetudo_fr7_000036.html)
  - 平面交差の成立条件、45度以上の交差角、第1種を原則とする設備条件、警報時間、踏切支障報知装置、障害物検知装置等の根拠とする。
- [国土交通省「踏切道改良促進法施行規則（踏切道指定基準）抜粋」](https://www.mlit.go.jp/report/press/content/001856444.pdf)
  - 交通遮断量、ピーク時遮断時間、歩道狭隘、事故回数、通学路、福祉施設、移動等円滑化等を課題評価の根拠とする。
- [国土交通省「主な鉄道用語」](https://wwwtb.mlit.go.jp/chubu/tetsudou/yougo.html)
  - 軌間および踏切種別の定義に使用。
- [国土交通省「道路構造令の各規定の解説」](https://www.mlit.go.jp/road/sign/kouzourei_kaisetsu.html)
  - 車道、車線、歩道、自転車施設、路肩、中央帯を独立した道路断面要素として扱う根拠に使用。

### 2.2 補助的な海外・交換形式資料

- [FHWA Highway-Rail Crossing Handbook, 3rd Edition](https://highways.dot.gov/safety/hsip/xings/highway-rail-crossing-handbook-third-edition/chapter-2-engineered-treatments-part)
  - 交差角、道路・鉄道の水平線形、縦断線形、見通し距離、舗装面を独立した幾何要素として扱う。
- [FRA U.S. DOT Crossing Inventory](https://railroads.dot.gov/sites/fra.dot.gov/files/2019-09/gxfile.pdf)
  - 線路数、車線数、交差角、踏切舗装種別、近接交差点、警報設備を網羅したインベントリ項目を、漏れの確認に使用。
- [ASAM OpenDRIVE 1.8.1 — Crossings](https://simulation.pages.asam.net/opendrive-group/opendrive-antora-gen/ASAM_OpenDRIVE_Specification/v1.8.1/specification/12_junctions/12_08_crossings.html)
  - 道路と鉄道の平面交差を `junction type="crossing"` とし、交通流が相互に乗り移らない交差として表す。将来のOpenDRIVE入出力との整合に使用。

踏切警報機・遮断機アセットそのものの寸法根拠は、既存の [`assets/blender/jp_crossing_dimensions.md`](../assets/blender/jp_crossing_dimensions.md) を参照する。本書では個々の製品形状ではなく、踏切全体の構造生成を扱う。

---

## 3. パラメータ体系

### 3.1 公開する最上位入力

```ts
interface CrossingGenerationInput {
  railwayClass: 'branch' | 'regional' | 'suburban' | 'trunk';
  roadClass: 'footpath' | 'local' | 'collector' | 'arterial';
  context: 'rural' | 'suburban' | 'urban';
  history: 'modern' | 'legacy';
  seed: number;
  overrides?: Partial<CrossingOverrides>;
}
```

この4項目をそのまま上位シナリオとして扱う。

```ts
interface CrossingScenario {
  railwayClass: 'branch' | 'regional' | 'suburban' | 'trunk';
  roadClass: 'footpath' | 'local' | 'collector' | 'arterial';
  context: 'rural' | 'suburban' | 'urban';
  history: 'modern' | 'legacy';
}
```

- `railwayClass`: 速度、列車本数、線路数、電化、軌道構造をまとめる。
- `roadClass`: 車線数、車線幅、設計速度、自動車交通量、大型車率をまとめる。
- `context`: 歩行者・自転車量、歩道要求、通学・福祉施設・駅近接、代替経路、立体交差の成立しやすさを補正する。
- `history`: 第3・4種等の歴史的な既設状態を再現するかを決める。通常は `modern` とする。

内部では、設定値と生成結果を次の段階に分離する。

```text
CrossingGenerationInput
  -> ResolvedCrossingConfig
  -> CrossingAssessment
  -> CrossingPlan
```

`ResolvedCrossingConfig` は現在の `RailwayConfig` に相当する低レベル値を保持するが、通常GUIの主入力にはしない。

### 3.1.1 上位シナリオ入力

4項目は固定完成形のプリセットではなく、相関する値を選ぶための独立した条件である。同じ条件でもseedにより単線・複線や歩道幅に差を出せるが、安全設備の必須条件はseedで変えない。交差角、住宅列に対する配置等の現地固有値は上位入力として別途指定する。

### 3.1.2 上位条件からの解決順序

```text
1. railwayClass + context
   -> 速度、列車本数、線路数、軌間、電化、軌道構造

2. roadClass + context
   -> 車線数、車線幅、歩道、自転車施設、交通量、大型車率

3. 鉄道線形 x 道路線形
   -> 交差角、踏切幅、踏切長、横断所要時間

4. 速度 + 列車本数 + 道路交通量 + 歩行者量 + 横断所要時間
   -> 平面交差、立体交差、統廃合の選択

5. 平面交差が成立する場合
   -> 遮断機、警報機、検知器、方向表示、歩行者設備

6. 設置設備の結果
   -> protectionClass
```

新設・現代条件で平面交差が不適切な場合は、無理に踏切を生成せず `grade-separated`、`closed`、または検証エラーを返す。景観上どうしても踏切を必要とする場合だけ、明示的なoverrideを使う。

### 3.2 配置・交差

| パラメータ | 型・単位 | 優先度 | 意味 |
| --- | --- | --- | --- |
| `crossingSide` | `left \| right` | P0 | 現在の住宅列に対する配置互換用 |
| `crossingOffsetM` | m | P0 | 住宅列から交差中心までの距離 |
| `crossingAngleDeg` | degree | P0 | 道路・鉄道線形から導出。現代法規準拠モードでは45度以上 |
| `railOrigin` / `roadOrigin` | `Vec2` | P1 | 独立シーンやインポート時の基準点 |
| `alignmentMode` | `local-parametric \| imported` | P1 | 角度指定か、入力線形からの導出か |

`local-parametric` では道路中心線を基準に `crossingAngleDeg` から線路方向を構築する。`imported` では双方の中心線から角度を導出し、角度を重複入力しない。

### 3.3 鉄道コリドー

| パラメータ | 型・単位 | 優先度 | 意味 |
| --- | --- | --- | --- |
| `trackCount` | integer | P0 | 横断する軌道数 |
| `gaugeM` | m | P0 | 各軌道の軌間。初期版は全軌道共通 |
| `trackCenterSpacingsM` | `number[]` | P0 | 隣接する軌道中心間隔。長さは `trackCount - 1` |
| `alignment` | line/arc | P1 | 直線または曲線中心線 |
| `grade` | ratio | P1 | 線路縦断勾配 |
| `cantM` | m | P2 | 左右レールの高低差 |
| `trackBedType` | `ballast \| slab \| embedded` | P0 | 軌道構造 |
| `ballastShoulderM` | m | P1 | 最外軌道から道床端までの幅 |
| `sleeperType` | `pc \| wood` | P1 | まくらぎ種別 |
| `sleeperSpacingM` | m | P1 | まくらぎ間隔 |
| `electrification` | `none \| overhead` | P0 | 非電化または架空電車線 |
| `catenaryMastSpacingM` | m | P2 | 架線柱配置間隔 |
| `railRunoffM` | m | P1 | 踏切外へ生成する線路延長 |

初期版では `trackCount` を1～4の生成対象とする。ただし、これはUI・テスト範囲であり、法令上の上限を意味しない。

### 3.4 道路コリドー

```ts
interface RoadCrossSectionConfig {
  lanes: Array<{ widthM: number; direction: 'forward' | 'backward' }>;
  leftShoulderM: number;
  rightShoulderM: number;
  leftSidewalkM: number;
  rightSidewalkM: number;
  medianWidthM: number;
  bicycleFacility: 'none' | 'lane-left' | 'lane-right' | 'both';
}
```

| パラメータ | 優先度 | 意味 |
| --- | --- | --- |
| `crossSection` | P0 | 車線、路肩、歩道、中央帯の左右非対称断面 |
| `alignment` | P1 | 直線または曲線中心線 |
| `approachGradeNear/Far` | P1 | 踏切両側の道路勾配 |
| `crossfall` | P2 | 道路横断勾配 |
| `surfaceType` | P1 | アスファルト等の道路舗装 |
| `accessMode` | P0 | `vehicle \| pedestrian \| mixed` |
| `nearbyJunction` | P2 | 近接交差点の距離・方向・信号有無 |

`roadWidthM` は入力として持たず、横断構成の合計から導出する。これにより、同じ総幅員でも「歩道なし4車線」と「2車線＋両側歩道」を区別できる。

### 3.5 踏切舗装・交差面

| パラメータ | 優先度 | 意味 |
| --- | --- | --- |
| `deckType` | P0 | `asphalt \| concrete \| rubber \| timber \| mixed` |
| `deckRailMarginM` | P1 | 最外レールから線路方向外側への舗装余長 |
| `deckRoadMarginM` | P1 | 道路端から外側への舗装余長 |
| `flangewayWidthM` | P1 | レール沿いの輪縁溝表現 |
| `levelResolution` | P1 | `rail-priority \| road-priority \| blended` |
| `drainageType` | P2 | `none \| side-ditch \| channel` |

踏切ポリゴンは固定矩形ではなく、鉄道コリドーと道路コリドーの交差から生成する。直線・平行複線の場合の概算は次の通り。

```text
外側レール間幅 = gaugeM + sum(trackCenterSpacingsM)
道路方向の基本横断長 ≒ 外側レール間幅 / sin(crossingAngleDeg)
踏切長 = 基本横断長 + 両側の舗装・安全余長
```

実装ではこの式を形状生成に直接使わず、オフセットした道路帯・軌道帯のポリゴン交差として解く。式は検算とテストオラクルに使う。

### 3.6 保安設備

| パラメータ | 優先度 | 意味 |
| --- | --- | --- |
| `protectionClass` | derived | 遮断機・警報機の結果から算出する `class1 \| class3 \| class4` |
| `gateLayout` | P0 | `none \| half-road \| split-entry-exit \| full-width` |
| `warningLayout` | P0 | `none \| two-mast \| four-mast \| overhead` |
| `pedestrianGateMode` | P1 | `none \| shared \| separate` |
| `obstacleDetector` | P1 | `none \| photoelectric \| lidar \| millimeter-wave` |
| `emergencyButton` | P1 | 踏切支障報知装置操作部 |
| `specialSignal` | P1 | 特殊信号発光機 |
| `controlCabinets` | P1 | `auto` または機器箱構成 |
| `lighting` | P2 | 照明柱の有無・数 |
| `guidanceMarking` | P1 | 踏切内誘導表示・カラー舗装 |
| `tactilePaving` | P1 | 左右歩道から連続する誘導ブロック |
| `protectiveFence` | P1 | 線路沿い柵・車両進入防護柵 |

保安設備を先に解決し、その結果から `protectionClass` を算出する。

```text
現代条件の原則
  -> 遮断機あり、警報機あり
  -> class1

列車速度130km/h以下
  AND 鉄道・道路交通量が著しく少ない
  OR 遮断機設置が技術的に著しく困難
  -> 警報機のみを例外的に許容
  -> class3

legacyかつ歴史的既設状態を再現
  -> 遮断機・警報機なしを許容
  -> class4 + safety warning
```

さらに以下を設備へ反映する。

- 2線以上では列車進行方向指示器を生成する。
- 130km/h超160km/h以下で自動車が通行する場合は、遮断機と障害物検知装置を必須にする。
- 大型車通行と高速列車が組み合わさる場合は、二段型・大型遮断装置またはオーバーハング型警報装置等を要求する。
- `split-entry-exit` では進入側を先に閉じ、退出側は車両の脱出猶予後に閉じる。

低レベルoverrideで不整合な設備や種別を指定した場合は、暗黙に別構成へ変えず `validationIssues` にエラーを返す。

### 3.7 運用・評価値

静的ジオメトリのMVPには必須ではないが、設備選択や将来のアニメーションに使用する。

- 列車速度、方向、時間当たり本数
- 道路交通量、歩行者・自転車交通量
- 警報開始距離、警報時間、遮断開始・終了遅延
- ピーク時遮断時間
- 踏切自動車交通遮断量、踏切歩行者等交通遮断量
- 設計車両、滞留長、近接交差点までの車列収容長
- 停止視距、線路方向視距、踏切通過完了に必要な視距

これらは `CrossingPlan` の形を直接ランダムに変える値ではなく、設備の推奨、警告、動的状態を決める入力とする。

---

## 4. 導出する生成結果

```ts
interface CrossingPlan {
  tracks: TrackPlan[];
  road: RoadPlan;
  deck: CrossingDeckPlan;
  devices: CrossingDevicePlan[];
  markings: MarkingPlan[];
  fences: FenceSpan[];
  cabinets: CabinetPlan[];
  catenary: CatenaryPlan;
  clearanceZones: ClearanceZone[];
  validationIssues: CrossingIssue[];
}
```

生成器は以下を入力から導出する。

- 各軌道の2本のレール、まくらぎ、道床、架線中心
- 道路の車線・歩道・路肩・中央帯ポリゴン
- 斜角に追従した踏切舗装ポリゴンとレール溝
- 踏切長、外側レール間幅、道路総幅員
- 進入車線ごとの停止線
- 車線と歩道を覆う遮断桿の台数、長さ、回転方向
- 各進入方向から視認できる警報機の位置と向き
- 歩道に連続する誘導表示、触知案内、歩行者遮断機
- 踏切開口を避けた線路沿い柵
- 列車・道路・遮断桿・障害物検知のクリアランス領域
- 機器箱、検知器、特殊信号発光機を配置できる候補領域

---

## 5. 制約・検証規則

### 5.1 データ整合性

- `trackCount >= 1`
- `trackCenterSpacingsM.length === trackCount - 1`
- 全車線・歩道・線路間隔・軌間は正値
- 交差角は0度でも180度でもない
- 進行可能な道路では車線が1本以上ある
- `class1/class3/class4` と遮断機・警報機の有無が一致する

### 5.2 幾何不変条件

- 同一軌道のレール間内法が `gaugeM` と一致する
- 軌道中心間距離が設定配列と一致する
- 踏切舗装が全車線・歩道と最外軌道を被覆する
- 踏切外ではまくらぎが設定間隔で連続し、舗装内に露出まくらぎを生成しない
- 遮断機、警報機、機器箱、架線柱が車道・歩道・軌道クリアランスへ侵入しない
- 柵が道路の踏切開口を塞がない
- 停止線が踏切舗装内または軌道内へ侵入しない
- 斜角・複線でも全出力座標とジオメトリ寸法が有限値である

### 5.3 安全上の警告

見通し距離や近接交差点条件が不足する場合、生成器が勝手に「安全」と判定して設備を省略してはならない。次のような警告を `validationIssues` に残す。

- `INSUFFICIENT_SIGHT_DISTANCE`
- `ROAD_STORAGE_TOO_SHORT`
- `EQUIPMENT_CLEARANCE_CONFLICT`
- `PEDESTRIAN_ROUTE_DISCONTINUITY`
- `PROTECTION_CLASS_MISMATCH`

---

## 6. シナリオ条件と互換プリセット

既存のプリセット名は互換入口として維持できるが、新規の公開APIでは3.1の4つのシナリオ条件を直接使用する。

| 互換プリセット | 対応する主なシナリオ・構成 |
| --- | --- |
| `JP_RURAL_SINGLE` | `branch + local + rural + modern`。単線、狭幅員道路、現代条件では原則第1種 |
| `JP_SUBURBAN_DOUBLE` | 複線、対面2車線、片側または両側歩道、第1種 |
| `JP_URBAN_MULTI` | 2～4線、両側歩道、第1種、分割遮断、障害物検知、高規格設備 |
| `JP_PEDESTRIAN` | 車道なし、歩行者通路、歩行者用設備 |
| `JP_INDUSTRIAL_SIDING` | 単線、低頻度、大型車進入路、広い踏切舗装 |
| `JP_LEGACY_SKEW` | 斜角交差、左右非対称道路、曲線または狭隘条件 |

シナリオ条件を変更すると、相互に成立する線路・道路・設備が再解決される。交差角等を上書きした場合も、設備配置と評価結果は再計画される。

---

## 7. 現行実装との差分

現行 `src/env/railway.ts` は、良質な第1種踏切の描画プロトタイプだが、次の前提が固定されている。

- 単線で、`rails` と `checkRails` が2本固定のタプル
- 道路は +X、線路は +Y の90度交差
- 道路幅・位置を `RailwayBounds` の住宅街路境界から暗黙取得
- 踏切舗装は軸平行矩形
- 警報機・遮断機は2組固定
- `safetyEquipment` は `basic/full` の見た目レベルに近い
- 軌道、道路、交差面、保安設備の設定が一つの `RailwayConfig` に混在
- `src/viewer/railway.ts` の一部が `centerX` とX/Y固定方向を前提にする

一方、再利用できるものも多い。

- 純TypeScriptの計画層とThree.js描画層の分離
- 既存のレール断面、まくらぎ、架線、柵、機器箱、検知器描画
- 詳細な踏切警報機・遮断機GLBとプロシージャルフォールバック
- 決定論テストとviewer smoke test
- 警報・遮断アニメーション状態

したがって全面的な作り直しではなく、**計画データを一般化し、描画関数を線分の局所座標系へ対応させる移行**とする。

---

## 8. 実装計画

### Phase 0 — 回帰基準の固定

目的: 現在の見た目と挙動を `JP_SUBURBAN_SINGLE_LEGACY` 相当の互換プリセットとして保存する。

作業:

- 現行 `DEFAULT_RAILWAY` 生成結果の主要寸法をスナップショット化
- 現在の単線・直角・第1種ケースを互換fixtureとして追加
- GLB使用時とフォールバック時のsmoke testを維持

完了条件:

- 移行前後でデフォルトケースのレール間隔、設備数、道路開口、警報・遮断状態が一致する

### Phase 1 — データモデルの分割と正規化

対象:

- `src/env/crossing/config.ts` 新設
- `src/env/crossing/types.ts` 新設
- `src/env/railway.ts` は一時的な互換exportへ縮小

作業:

- `CrossingConfig`、各サブconfig、`CrossingPlan`を定義
- 単位を名前に明記する (`gaugeM`, `crossingAngleDeg`)
- `resolveCrossingConfig()` でプリセット、`auto`、クランプを解決
- 現行 `RailwayConfig` から新configへの変換関数を用意

完了条件:

- `DEFAULT_RAILWAY` 相当の入力が新スキーマで表現できる
- config解決がThree.js非依存かつ決定論的

### Phase 2 — 任意方向の単線・道路断面

対象:

- `src/env/crossing/geometry.ts`
- `src/env/crossing/planRoad.ts`
- `src/env/crossing/planTracks.ts`
- `src/env/crossing/planSurface.ts`

作業:

- 中心点と単位ベクトルによる道路・線路局所座標系を導入
- 車線・路肩・左右歩道から道路帯ポリゴンを生成
- 交差角に応じて軌道帯と道路帯の交差ポリゴンを生成
- まくらぎを踏切舗装部分だけ除外
- 既存90度ケースを一般化した計算へ置換

完了条件:

- 30、45、60、90度の単線踏切を生成できる
- 左右非対称歩道を含む道路断面が破綻しない
- 交差角を変更すると踏切長と舗装形状が連動する

### Phase 3 — 複線・多線化

作業:

- `TrackPlan[]` として軌道ごとの中心線・レール対を生成
- `trackCenterSpacingsM[]` から各軌道中心位置を解決
- 最外軌道から踏切舗装・柵開口・機器離隔を導出
- 軌道ごとのまくらぎ、道床、架線を生成
- viewerの固定タプル前提を配列ループへ変更

完了条件:

- 1～4線を同一コードパスで生成できる
- 配列長、軌間、線路中心間隔の不変条件がテストされる
- 線路数を増やすと踏切長・設備間隔・柵開口が自動更新される

### Phase 4 — 保安設備文法

対象:

- `src/env/crossing/planProtection.ts`
- `src/env/crossing/validate.ts`

作業:

- 第1・3・4種の成立条件をルール化
- 進入方向と車線群から警報機・遮断機候補位置を生成
- 車道、歩道、中央帯に応じて遮断桿を分割
- 停止線、誘導表示、触知案内、柵開口を派生生成
- 障害物検知領域、機器箱候補領域、特殊信号を計画
- 不成立条件を `validationIssues` として返す

完了条件:

- 各踏切種別で禁止設備・必須設備のテストが通る
- 2車線＋両側歩道、中央帯あり道路、歩行者専用の設備構成を生成できる
- 設備が道路・歩道・軌道クリアランスへ侵入しない

### Phase 5 — viewerの局所座標化

対象:

- `src/viewer/railway.ts`
- `src/viewer/railwayAssets.ts`

作業:

- `centerX` 依存を廃止し、各plan要素の `center`, `direction`, `normal`, `yawDeg` を使う
- 斜角踏切舗装を任意ポリゴンとして描画
- レール溝、道路標示、遮断機アームを局所座標で描画
- GLB設備を `CrossingDevicePlan` の姿勢・遮断桿長へ適合
- 軌道数増加時もリソース破棄が正しく行われるようにする

完了条件:

- 全プリセットのgeometryにNaN・Infinityがない
- 警報機が全進入方向を向き、遮断桿が対象車線・歩道を覆う
- 既存GLBとフォールバックが同一planで動作する

### Phase 6 — GUI・プリセット・URL状態

対象:

- `src/main.ts`

作業:

- GUIを「配置」「鉄道」「道路」「交差面」「保安設備」に分割
- 線路数、線路間隔、道路断面、交差角、踏切種別、舗装種別を追加
- 成立しない組合せをGUIで無効化または警告表示
- 主要パラメータをURL queryへ保存し、再現可能にする
- 既存の `barrierClosed`、`warningActive` を構造設定とは別のruntime stateに分離

完了条件:

- 同一URL・seedで同一踏切を再現できる
- 構造値を変えると関連する導出形状が一度の再生成で更新される

### Phase 7 — 曲線・縦断・OpenDRIVE連携

後続拡張として実施する。

- 円弧・複合線形、カント、道路進入勾配、横断勾配
- 交差面の高さブレンドと腹付き警告
- 見通し領域と遮蔽物評価
- OpenDRIVE `junction type="crossing"`、各軌道のrail roadへの入出力
- 動的警報時間と遮断アニメーション

OpenDRIVEは道路・交差・限定的な鉄道表現を担当し、踏切固有の警報機、遮断機、障害物検知装置は内部拡張データとして保持する。

### Phase 8 — 上位シナリオ解決層

現在の低レベル `RailwayConfig` を維持したまま、その前段にシナリオ解決層を追加する。

対象:

- `src/env/crossing/scenario.ts`
- `src/env/crossing/assessment.ts`
- `src/main.ts`

作業:

- `CrossingGenerationInput`、`CrossingScenario` を定義
- 鉄道・道路・地域・年代条件を公開入力として直接受け取る
- `resolveCrossingScenario()` で低レベルconfigを決定論的に生成
- 交通量、踏切長、横断時間、歩道狭隘等から `CrossingAssessment` を生成
- 必要設備を解決してから `protectionClass` を算出
- 現代条件で第4種、45度未満、速度条件に反する第3種等を生成しない
- 現在のGUIパラメータは「詳細設定・override」へ移動

完了条件:

- 4つのシナリオ条件とseedだけで成立する踏切を生成できる
- 同じ安全条件でseedを変えても必須設備が欠落しない
- `history: legacy` 以外から第4種が生成されない
- 低レベルconfigを直接指定する既存テストと表示を維持できる

---

## 9. テスト計画

### 純ロジック単体テスト

- 全シナリオ条件が決定論的に低レベルconfigへ展開される
- seedを変えても法規・安全上の必須設備が変化しない
- `modern` から第4種が生成されず、`legacy` の第4種には警告が付く
- 2線以上で列車進行方向指示器が生成される
- 130km/h超かつ自動車通行可能な場合に遮断機と障害物検知装置が生成される
- 同一seed・configのJSON完全一致
- 軌間、線路中心間隔、道路総幅員の数値一致
- 交差角が小さくなると踏切長が増える
- `trackCount` 増加で外側レール間幅が単調増加する
- 踏切舗装が道路断面と全軌道を被覆する
- 舗装領域内に露出まくらぎが存在しない
- 第1・3・4種の設備成立条件
- 歩道の有無による歩行者設備の生成
- 柵、設備、停止線のクリアランス
- 不正配列長・ゼロ幅・平行交差に対するvalidation

### プロパティテスト相当

依存ライブラリを増やさず、seedと代表値をループして検査する。

- `trackCount = 1..4`
- `crossingAngleDeg = 30, 45, 60, 75, 90`
- 歩道: なし／左のみ／右のみ／両側
- `protectionClass = class1, class3, class4`
- 全点・寸法がfinite
- すべての禁止領域の重なりが許容誤差以下

### viewer smoke test

- 全プリセットをヘッドレスで構築できる
- meshのbounding boxとmatrixがfinite
- GLB失敗時にプロシージャル設備へフォールバックする
- dispose後に生成固有geometry/materialが残らない

### 手動ビジュアルQA

- 真上: 道路断面、斜角舗装、停止線、柵開口
- 道路進入方向: 警報灯の視認方向、遮断桿の被覆
- 線路方向: 建築限界、機器箱、架線柱、検知器
- 遮断状態: 退出側を含む遮断文法と歩行者動線

---

## 10. 推奨する最初の実装スコープ

最初のリリースでは次を実装する。

1. 直線軌道・直線道路
2. 1～4線、共通軌間、可変線路中心間隔
3. 45～90度の現代法規準拠交差角。30～45度未満はlegacyまたは明示overrideのみ
4. 1～4車線、左右独立の歩道・路肩
5. バラスト軌道とアスファルト／コンクリート／ゴム踏切舗装
6. 設備から導出する第1・3種、およびlegacy明示時のみの第4種
7. 2基・4基警報機、半遮断・進入退出分割、歩行者遮断機
8. 既存の電化、まくらぎ、検知器、機器箱、警報・遮断状態
9. 6プリセットとURL再現

曲線、カント、縦断勾配、見通し計算、OpenDRIVE入出力は次リリースへ分離する。これにより、最初の段階で「線路数・道路幅・交差角から踏切全体が組み替わる」という目的を達成しつつ、3Dサーフェス問題を後段へ隔離できる。

---

## 11. 実装完了の受け入れ基準

- 4つのシナリオ条件とseedだけで、相関のある鉄道・道路・踏切設備を生成できる。
- 線路数、道路横断構成、交差角、踏切種別は詳細GUIからoverrideできる。
- それらの変更により、踏切長、舗装、停止線、柵、警報機、遮断機が連動して再計画される。
- `src/env/crossing/` はThree.jsへ依存しない。
- 同一設定とseedから常に同一 `CrossingPlan` が生成される。
- 第1・3・4種の設備条件に矛盾がない。
- `protectionClass` が設備決定後の結果分類になっている。
- `seed` によって法規・安全上必要な設備が省略されない。
- 代表ケースとパラメータ組合せの単体・smoke testが通る。
- 現行デフォルト踏切の外観と動作を互換プリセットで維持する。
- 将来、各軌道をOpenDRIVEのrail road、交差部をcrossing junctionへ写像できるデータ構造になっている。

---

## 12. 実装時に決める未確定事項

次の項目はPhase 1開始時に短いADRまたは本書更新で確定する。

1. `src/env/crossing/` と `src/gen/crossing/` のどちらへ置くか。現状の街路環境との結合を考えると、まず `src/env/crossing/` を推奨する。
2. 任意ポリゴン交差を既存 `shared/geom2d.ts` へ追加するか、踏切専用の凸ポリゴンクリップとして閉じるか。
3. 遮断桿長を既存GLBの伸縮で表現するか、桿だけプロシージャル生成へ分離するか。
4. 曲線・縦断対応前にOpenDRIVE読み込みを着手するか。推奨は内部モデルを先に安定させる順序。
5. シナリオ条件ごとの列車本数、交通量、歩行者量の分布を、踏切道安全通行カルテの実データからどの粒度で校正するか。
