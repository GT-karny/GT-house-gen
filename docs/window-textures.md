# 住宅窓テクスチャ

戸建て・集合住宅の窓越しに室内を直接見せず、カーテン、暗い室内、ブラインド、型板ガラスで生活感を出すための画像セット。

## ファイルと用途

| ファイル | 想定用途 | 点灯 |
|---|---|---|
| `public/textures/window/curtain-blackout-day.jpg` | 閉じた遮光カーテン | なし |
| `public/textures/window/curtain-lace-day.jpg` | 昼のレースカーテン | なし |
| `public/textures/window/interior-dark-day.jpg` | 消灯した暗い室内 | なし |
| `public/textures/window/curtain-warm-night.jpg` | 厚手カーテン越しの暖色光 | あり |
| `public/textures/window/curtain-lace-warm-night.jpg` | レース越しの暖色光 | あり |
| `public/textures/window/blinds-warm-night.jpg` | ブラインド越しの暖色光 | あり |
| `public/textures/window/frosted-glass-warm-night.jpg` | 小窓・水回り・階段室の型板ガラス | あり |
| `public/textures/window/interior-map-curtain-offwhite-on.png` | 物理カーテン・オフホワイト | あり |
| `public/textures/window/interior-map-curtain-offwhite-off.png` | 物理カーテン・オフホワイト | なし |
| `public/textures/window/interior-map-curtain-beige-on.png` | 物理カーテン・ベージュ | あり |
| `public/textures/window/interior-map-curtain-gray-off.png` | 物理カーテン・グレー | なし |
| `public/textures/window/interior-map-empty-room-on.png` | カーテンなし室内 | あり |
| `public/textures/window/interior-map-empty-room-off.png` | カーテンなし室内 | なし |

生成にはCodex組み込みの画像生成機能を使用した。生成画像を中央基準で `1024x683` に整え、sRGB JPEG（quality 88）として保存している。窓枠、サッシ、方立、外光反射はThree.js側の形状・マテリアルに任せるため、画像には含めていない。

## 割り当て

`src/viewer/windowSurfaces.ts` が `seed`、窓サイズ、窓位置から決定論的に画像を選ぶ。同じ入力では常に同じ結果になる。

- `day`: 非点灯の3種類だけを使用
- `night`: 点灯した4種類だけを使用
- `mixed`: 窓ごとに昼70%、点灯30%
- 小窓: 暗い室内または型板ガラスを多めにする
- 中・大窓: レース、カーテン、ブラインドを多めにする

戸建てと集合住宅のGUIにある「窓 (昼/夜/混在)」で切り替える。初期値は `mixed`。

## Interior Mapping 試作

GUI の「窓 Interior Mapping」をオンにすると、カーテンの色・有無・点灯状態が異なる6種類の仮想室内をseedと窓位置から決定論的に選ぶ。昼・夜それぞれ約1/3をカーテンなしとし、`mixed` は従来どおり窓ごとに昼70%・点灯30%。オフにするとseedから選ぶ従来の平面画像方式へ戻る。

元シーンは `assets/blender/interior_mapping_variants.blend`。約3.6m×2.7m×2.4mの室内に、窓面から約0.03〜0.07m（平均約0.05m）の範囲でひだが前後する閉じたカーテン、左右壁、床、天井、控えめな暖色面光源を置いた。カーテンはレール幅3.52mに対して4.30m（1.22倍）の布を上端で圧縮してピン留めし、重力・曲げ・自己衝突・床衝突を有効にしたCloth物理を120フレーム計算後、結果を固定している。面別レンダーは `assets/blender/interior_mapping_variants/` に保存している。

シェーダーは窓ローカル空間で、UVを仮想ボックス前面上のレイ原点、カメラからフラグメントへの方向をレイ方向として使う。奥面・左右面・床・天井までの距離のうち最短の交点を選び、対応するアトラスタイルを参照する。カーテンありは正規化深度0.07、カーテンなしは1.10とし、閉じたカーテンはガラス直後、空室は奥まで見える。追加ジオメトリ、透過、追加ドローは使わない。

描画は追加ジオメトリや透過を使わない一層構成。`MeshPhysicalMaterial` の不透明なベースに画像を置き、`clearcoat` の鋭いIBL反射を重ねてガラス越しの見え方を擬似的に作る。夜画像だけ弱い `emissiveMap` を有効にするため、窓数の多い集合住宅でも透明ソートや二層分のドローコールを増やさない。

Three.js側ではさらに `onBeforeCompile` で次のFresnel項を追加する。固定色のリムではなく、標準シェーダーが計算したHDRI由来の `indirectSpecular` と `clearcoatSpecularIndirect` を斜め視点で増幅する。

```glsl
float windowDotNV = saturate(dot(geometryNormal, geometryViewDir));
float windowFresnel = pow(1.0 - windowDotNV, 3.0);
outgoingLight += reflectedLight.indirectSpecular * windowFresnel * 1.15;
outgoingLight += clearcoatSpecularIndirect * windowFresnel * 0.55;
```

## 生成プロンプト

以下は生成時に使用したプロンプト。再生成時は、各画像を別々の生成リクエストとして渡す。

### curtain-blackout-day.jpg

```text
Use case: stylized-concept
Asset type: game-ready albedo texture for the inside surface behind residential window glass in a Japanese detached house and apartment generator
Primary request: front-facing close-up texture of fully closed warm greige blackout curtains, subtle realistic vertical fabric folds, opaque enough that no room interior is visible
Scene/backdrop: the curtain fills the entire image edge to edge
Style/medium: photorealistic architectural visualization texture, restrained and neutral
Composition/framing: perfectly orthographic straight-on, flat rectangular surface, centered, no perspective
Lighting/mood: soft overcast daylight filtered through exterior glass, low contrast
Color palette: warm ivory, pale greige, very subtle cool blue-gray glass cast
Materials/textures: fine woven curtain fabric, broad natural folds, no harsh highlights
Constraints: no window frame, no sash, no mullions, no wall, no room objects, no exterior reflection, no people, no text, no watermark; usable when stretched to windows of different aspect ratios; avoid distinct focal features
```

### curtain-lace-day.jpg

```text
Use case: stylized-concept
Asset type: game-ready albedo texture for the inside surface behind residential window glass in a Japanese detached house and apartment generator
Primary request: front-facing close-up texture of closed white lace curtains, dense privacy weave so the interior cannot be seen, delicate understated vertical folds
Scene/backdrop: the curtain fills the entire image edge to edge
Style/medium: photorealistic architectural visualization texture, restrained Japanese residential realism
Composition/framing: perfectly orthographic straight-on, flat rectangular surface, centered, no perspective
Lighting/mood: diffuse daytime light, softly luminous but not overexposed
Color palette: off-white, pale cool gray, faint blue glass cast
Materials/textures: fine translucent privacy fabric with subtle weave, broad folds without decorative motifs
Constraints: no window frame, no sash, no mullions, no wall, no room objects, no exterior reflection, no people, no text, no watermark; usable when stretched to windows of different aspect ratios; avoid distinct focal features
```

### interior-dark-day.jpg

```text
Use case: stylized-concept
Asset type: game-ready albedo texture for the inside surface behind residential window glass in a Japanese detached house and apartment generator
Primary request: a nearly black, unlit residential interior seen through dark privacy glass, with only extremely vague soft tonal variation suggesting depth; no recognizable furniture or room details
Scene/backdrop: dark glass/interior darkness fills the entire image edge to edge
Style/medium: photorealistic architectural visualization texture, subtle and physically plausible
Composition/framing: perfectly orthographic straight-on, flat rectangular surface, centered, no perspective
Lighting/mood: daytime exterior against an unlit interior, very dark, low contrast
Color palette: charcoal, deep blue-gray, muted desaturated teal-black
Materials/textures: smooth glass darkness with faint soft vertical shadow gradients
Constraints: no window frame, no sash, no mullions, no wall, no recognizable objects, no exterior scene or strong reflection, no people, no text, no watermark; usable when stretched to windows of different aspect ratios; avoid distinct focal features
```

### curtain-warm-night.jpg

```text
Use case: stylized-concept
Asset type: game-ready albedo texture for the inside surface behind residential window glass in a Japanese detached house and apartment generator
Primary request: front-facing close-up of closed warm off-white curtains at evening, softly lit from the room behind so only a gentle amber glow is visible; complete privacy, no silhouettes
Scene/backdrop: the curtain fills the entire image edge to edge
Style/medium: photorealistic architectural visualization texture, tasteful Japanese residential evening mood
Composition/framing: perfectly orthographic straight-on, flat rectangular surface, centered, no perspective
Lighting/mood: subtle warm indoor light behind curtains, restrained glow, darker at folds and edges
Color palette: warm cream, muted amber, faint brown-gray shadows
Materials/textures: fine woven fabric, broad natural vertical folds
Constraints: no window frame, no sash, no mullions, no wall, no room objects, no silhouettes, no exterior reflection, no people, no text, no watermark; usable when stretched to windows of different aspect ratios; avoid distinct focal features
```

### curtain-lace-warm-night.jpg

```text
Use case: stylized-concept
Asset type: game-ready albedo texture for the inside surface behind residential window glass in a Japanese detached house and apartment generator
Primary request: closed white lace privacy curtains at night, softly illuminated by warm indoor light from behind, fully obscuring the room while producing an inviting muted amber glow
Scene/backdrop: the curtain fills the entire image edge to edge
Style/medium: photorealistic architectural visualization texture, realistic Japanese residential window
Composition/framing: perfectly orthographic straight-on flat surface, no perspective, no frame
Lighting/mood: restrained warm indoor illumination, natural brightness variation across broad vertical folds, not overexposed
Color palette: warm ivory, pale amber, soft gray in fold shadows
Materials/textures: dense fine lace weave without decorative motifs
Constraints: no window frame, sash, mullions, wall, room objects, silhouettes, people, text, watermark, exterior reflection or view; usable when stretched to different window aspect ratios; no distinct focal features
```

### blinds-warm-night.jpg

```text
Use case: stylized-concept
Asset type: game-ready albedo texture for the inside surface behind residential window glass in a Japanese detached house and apartment generator
Primary request: closed horizontal venetian blinds at night with soft warm residential light glowing between narrow slats, privacy maintained and nothing recognizable behind them
Scene/backdrop: blinds fill the entire image edge to edge
Style/medium: photorealistic architectural visualization texture, restrained modern Japanese apartment realism
Composition/framing: perfectly orthographic straight-on flat surface, level horizontal lines, no perspective, no frame
Lighting/mood: subtle warm indoor light, low contrast, gentle irregularity rather than uniformly bright
Color palette: warm off-white blinds, muted amber gaps, soft taupe shadows
Materials/textures: matte thin aluminum or resin blind slats
Constraints: no cords, handles, window frame, sash, mullions, wall, room objects, silhouettes, people, text, watermark, exterior reflection or view; usable when stretched to different window aspect ratios
```

### frosted-glass-warm-night.jpg

```text
Use case: stylized-concept
Asset type: game-ready albedo texture for the inside surface behind a small residential window in a Japanese detached house and apartment generator
Primary request: warm indoor light diffused through privacy-patterned frosted glass at night, completely obscuring the bathroom or stairwell interior, subtle irregular glass texture
Scene/backdrop: glowing privacy glass fills the entire image edge to edge
Style/medium: photorealistic architectural visualization texture, physically plausible Japanese residential patterned glass
Composition/framing: perfectly orthographic straight-on flat surface, no perspective, no frame
Lighting/mood: dim-to-medium warm light, softly diffused, slightly darker toward edges, no hot spots
Color palette: muted amber, honey ivory, soft gray-gold
Materials/textures: fine rippled frosted glass pattern, subtle and non-decorative
Constraints: no window frame, sash, mullions, wall, recognizable interior, silhouettes, people, text, watermark, exterior reflection or view; usable when stretched to different small-window aspect ratios; no distinct focal features
```
