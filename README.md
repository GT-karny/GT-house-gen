# house-gen

日本の戸建住宅を**手続き的に生成**する Three.js プロトタイプ。敷地（lot）を入力に、駐車場・アプローチ・庭・塀を含む**敷地計画**と、建物の**フットプリント／ファサード／屋根**を生成し、CC0 の PBR テクスチャ＋IBL でフォトリアルに描画します。

生成ロジック（`src/gen/`）は Three.js 非依存の純 TypeScript で、描画層と厳密に分離しています（描画エンジン非依存の移植可能なコア）。

> **方針（重要）**: **建物ジオメトリ**（壁・窓・ドアのモジュラーパネル）は今後**アセットに依存しない完全プロシージャル生成**へ移行します。ただし**テクスチャ・車・植物などはアセット利用でOK**（CC0 等）。詳細は末尾「方針・今後の課題」。

---

## セットアップ / コマンド

```bash
pnpm install
pnpm dev         # Vite 開発サーバ (http://localhost:5173)
pnpm build       # tsc 型チェック + vite build → dist/
pnpm test        # vitest 一括実行
pnpm test:watch  # vitest ウォッチ
pnpm typecheck   # tsc --noEmit
```

単一テストの実行:

```bash
pnpm vitest run src/gen/site.test.ts                 # ファイル指定
pnpm vitest run -t "no gaps"                          # テスト名(部分一致)指定
```

- パッケージマネージャは **pnpm**。`esbuild` のみビルド許可（`package.json` の `pnpm.onlyBuiltDependencies`）。初回に esbuild 未ビルドで失敗する場合は `pnpm rebuild esbuild`。
- CC0 アセットは `public/textures/`・`public/hdri/`（Vite が `/` 配下で配信）。

---

## アーキテクチャ

**2層構成 + GUI** に明確分離しています。

```
src/
  gen/     ★ 純ロジック(Three.js非依存 = 移植可能なコア)
  viewer/  Three.js 描画(移植対象外)
  main.ts  lil-gui 配線 + シード乱択の解決
public/    CC0 テクスチャ / HDRI
```

### 生成パイプライン（`src/gen/building.ts` `generateHouse`）

```
Lot ──► planSite ──► HousePad ──► generateFootprint ──► tiers ──► generateFacade ──► panels
(敷地)   (site.ts)     (敷地内の      (footprint.ts)      (階層     (facade.ts)         (壁/窓/ドア)
                       建築可能矩形)                       リング)
                        └► zones/props/fences(駐車/庭/塀/植栽/車)   └► buildRoofs (roof.ts)
```

- **`site.ts` planSite** — 敷地を**隙間なくゾーニング分割**（背面/左右/前面フォアコート/建物下地の base tiles が lot を厳密タイル化）。設計順は外構の定石＝**動線（駐車＋L字アプローチ）を先**に決め、建物を奥に配置、庭は残りを充填。駐車寸法・建蔽率・最小建物寸法・塀の種別など Web 調査ベースの規則を実装。出力 `HousePad` が建物の収まる矩形（間口/奥行のベイ上限）を与える。
- **`footprint.ts` generateFootprint** — 矩形マスの合成（コア＋ウイングで L/T/U/ガレージ）を**整数ベイ格子**上でラスタライズ→境界トレースし、壁長を必ず `panelW` の整数倍に保証。マスごとに階数を持ち（下屋=1）、**階層別 union ring（tiers）**を生成→ファサード/屋根が段状に。`HousePad` があれば敷地に合わせてクランプ＆後方アンカー配置。
- **`facade.ts` generateFacade** — 外壁を `floors × bays` 格子に分割し、**分割文法**でモジュール（wall/window/door）を割当。面の役割（street/garden/side）で窓密度・サイズを制御。決定論ハッシュ乱数で階跨ぎの縦整列を保証。
- **`roof.ts` / 描画側 buildRoof** — 陸屋根/切妻/寄棟/片流れ。マス毎に軒高が異なり段状。

### 描画（`src/viewer/`）

- `scene.ts` — カメラ/ライト/OrbitControls、**CC0 HDRI を IBL 環境マップ**に、ACES トーンマップ。
- `render.ts` — パネルを種別ごとに **InstancedMesh** 化、屋根を厚み付き（`thicken`）で構築。`RenderParams` に屋根形状/色・外壁スタイル・塀色/種別など（`main.ts` がシードから解決）。
- `materials.ts` / `textures.ts` — CC0 の diffuse+normal+rough(+metal/alpha) を `pbr()` で組み立て。
- `modules.ts` — 窓・ドアの詳細ジオメトリ（見切り/框/ガラス/庇 等）。**壁面は `WALL_TILE` の実寸平面UV（`planarBoxUV`）で統一**し、板厚は `WALL_THICKNESS` で見切りと面一。
- `site.ts` — 敷地の地面ゾーン/塀（ブロック/木塀/メッシュ/生垣）/プロップ（物置・室外機・駐輪・車・カーポート・植栽）を描画。

### 重要な規約

- **座標系**: 生成側は XY 地面 + Z 上（Z-up ワールド規約）。Three へは `toThree(x,y,z) = (x, z, -y)`。敷地ローカルは `u`=街路平行、`v`=道路からの奥行き（v=0 が接道）。
- **決定論**: 同一 `seed` → 同一出力（`rng.ts` のハッシュ乱数）。`main.ts` の `auto` 系（屋根/外壁/塀/色）もシードから決定。
- **描画非依存の目印**: 出力 `PanelInstance`／敷地データは描画側で instanced-mesh・属性付き点になる想定。純ロジックは描画エンジンに依存しない。

---

## アセット（CC0 / パブリックドメイン）

すべて **CC0**。出典一覧は [`public/textures/CREDITS.txt`](public/textures/CREDITS.txt)。

- **Poly Haven**: painted_plaster / wood_planks / japanese_stone_wall / clay_roof_tiles / asphalt / concrete / grass / gravel / leafy_grass / bark、環境 HDRI。
- **ambientCG**: Metal032（金属）/ Fence007A（Opacity アルファ付き金網フェンス）。

---

## テスト

- `src/gen/*.test.ts` — 純ロジックの検証（敷地の隙間なし被覆・最小寸法・駐車/植栽の配置制約・決定論 等）。
- `src/viewer/*.smoke.test.ts` — ヘッドレスでのジオメトリ構築（テクスチャは空 Texture にフォールバック）。

---

## 方針・今後の課題

関連する調査・設計資料:

- [日本の踏切プロシージャル生成 — パラメータ調査・設計・実装計画](docs/level-crossing-parametric-design.md)
- [日本の集合住宅プロシージャル生成 — 調査・実装計画](docs/apartment-gen-research.md)

- **建物ジオメトリの完全プロシージャル化**: 壁・窓・ドアの**モジュラーパネル（板アセット）に依存しない**、開口・框・水切り等まで**手続き的にジオメトリ生成**する方式へ。
- **アセット利用でよいもの**: **テクスチャ／マテリアル・車・植物**などはアセット（CC0 等）に頼ってよい。プロシージャル化の対象は建物ジオメトリに限定する。
- **純ロジックの再利用性**: `src/gen/` の純ロジック（`planSite` / `generateFootprint` / `generateFacade` / `buildRoofs`）は Three.js に依存しないため、他ランタイムへの移植・再利用がしやすい構成を維持する。`ComputeRoadAlignedOBB` 等の 2D ユーティリティも同様。
