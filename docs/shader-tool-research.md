# シェーダーツール設計リサーチ（2026-08-04）

Pinterest参考画像（黒背景＋グロー球体＋縞ガラス歪み）系のビジュアルを簡単に作れるツールを
MOTION LAB に追加するための調査まとめ。3方向（既存ツールUI / X・コミュニティ動向 / UX設計パターン）から調査。

---

## 1. 参考画像スタイルの正体

- 英語圏の呼称: **fluted glass / ribbed glass / reeded glass effect**、**fractal glass gradients**（Pixelbuddha発、2024–25年のY2Kリバイバルで流行中の呼び名）、glass dispersion / liquid glass
- 日本語圏: リブガラス、フルーテッドガラス、モールガラス風
- CSS `backdrop-filter` では原理的に不可能（別位置のピクセルを参照できない）→ WebGL/Canvasツールの存在価値がここにある

### 技術パイプライン（4段）

1. **ベース画像**: 黒背景＋放射状グラデ球体（2–3色、オレンジ×青の補色系）＋強ガウスぼかし
2. **縞状ディスプレースメント（核心）**: UVを縞幅で量子化 `floor(uv.x*n)/n`、縞内ローカル座標に三角波/サイン波/鋸歯波のオフセットを掛けてサンプル座標をずらす。
   制御パラメータ: 縞の本数/幅・方向（角度）・歪みプロファイル（prism/lens/wave/zigzag）・歪み強度・スライスオフセット（stretch/shift）
3. **色収差**: RGBを別オフセットでサンプリング（RとBを逆方向へ）。複数回サンプル＋段階シフトの平均で帯が滑らかに。「言われないと気づかない程度」が上品
4. **仕上げ**: 縞エッジのハイライト/シャドウ（プロファイル勾配→擬似法線）、縞方向の一方向ブラー、グレイン

---

## 2. 競合・参考ツールとパラメータ

### Paper Shaders（shaders.paper.design）★最重要参考

Apache 2.0 OSS・ゼロ依存WebGL・28種。**「Fluted Glass」シェーダーがまさに参考画像のスタイル**。

Fluted Glass のパラメータ（そのまま設計の土台になる）:

| param | 内容 |
|---|---|
| `size` | 縞幅 |
| `shape` | 縞形状: lines / wave / zigzag |
| `angle` | 0–180° |
| `distortionShape` | prism / lens / contour |
| `distortion` / `stretch` / `shift` | 歪み量・伸長・ずらし |
| `shadows` / `highlights` | 縞エッジの陰影 |
| `blur` / `edges` / `margin` / `grain` | 仕上げ |

設計思想: **効果固有パラメータは全て0–1正規化**、幾何系（`fit/scale/rotation/offsetX,Y/originX,Y`）は全シェーダー共通プロパティ。アニメは `speed`（0で停止）＋ `frame`（手動スクラブ）の2軸のみ。
球体側の素材も mesh gradient / grain gradient / metaballs / god rays 等で揃う。

### Unicorn Studio

ノーコードWebGLの代表格。Figma風レイヤースタック＋75+エフェクト（Filters/Distortion/Blur/Lighting/Stylize カテゴリ）。
- イベント: Appear / Scroll / Hover / Mousemove。Duration 0–1000ms、Delay 0–2500ms、Sensitivity 0–1、scroll start/end 0–100%
- パフォーマンス推定器（frame time / draw calls）常時表示、レイヤー単位ダウンサンプリング
- 書き出し: Image / Video / 埋め込み / JSON。Free=8公開まで、$20/月

### ShaderGradient

動くグラデ特化・MIT OSS。**全パラメータをURLクエリにシリアライズ**（共有＝URLコピー）が最大の発明。
`type: plane|sphere|waterPlane`、uStrength/uDensity/uSpeed、color1–3、camera系、`grain`、`animate/loop/loopDuration`。

### その他

- **Figma Displaceプラグイン**: 「プリセット選択→offsetスライダー1本」の2ステップUI（最小構成の好例）
- **Figma純正ガラスエフェクト**（2025）: 5パラメータのみの割り切り
- **twigl**: GIF書き出し＋パーマリンクでXシェア前提。#つぶやきGLSL文化の中心
- **tixy.land**: 1式入力→即結果。制約の強さがバズの源泉
- **NodeToy / cables.gl**: ノードベース（上級者向け、今回の方向性ではない）
- **Endless Tools**: テンプレートから開始する3D系。$20/月
- **liquidglass (GitHub: ybouane)**: 屈折＋色収差＋Fresnel＋スペキュラを1フラグメントシェーダーで実装した参考コード

---

## 3. 「作りやすい」UXの設計則（調査から抽出）

1. **実質スライダー10本以下**。CHI論文（GANSlider）: スライダー1本ごとに操作数+19%、5–10次元超で操作困難。超える分は Shape/Color/Motion/Export 等のグループに折りたたむ
2. **プリセット→微調整の2段構え**。8–20個の動くサムネイル付きプリセット。命名は技術用語でなく情景名（dawn, lobby…）。プリセットはロックでなく開始点
3. **ランダマイズは主役機能**。目立つダイス＋キーボードショートカット（Coolorsのスペースキー）＋気に入った要素のロック。**起動時に白紙を見せない**（ランダムプリセットをロード）
4. **形状はenumで選ばせる**（lines/wave/zigzag × prism/lens/contour）。連続値でいじらせないことが「壊れた絵にならない」保険
5. **意味パラメータで公開、物理パラメータは隠す**。IORでなく「色ズレ量」1本
6. **カラーは3層**: 既定=パレット一括（3–5色）／中級=役割名付き個別ピッカー／メッシュ系=キャンバス直接操作
7. **URLシリアライズ**で共有・再現・派生（ShaderGradient/UJI方式）。実装コスト低で効果大
8. **書き出し形式の不足が最頻の不満**。最低ライン: PNG（解像度指定・透過）＋コード（CSS/React）＋アニメはWebM/GIF。サインアップ壁を書き出しの前に置かない
9. **重い時はプレビュー解像度/FPSを落とすオプション**＋負荷の可視化（Unicorn方式）
10. 失敗パターン: 二重メンタルモデルの直接操作（meshgradient.comの入出力メッシュ）、書き出しPNGのみ、カスタマイズ過少/過多の両極、古いUI

---

## 4. 新ツール設計案: `glass-lab`（仮）

MOTION LAB 流儀（単体HTML・依存ゼロ・ダークUI）で、WebGLフラグメントシェーダー1枚構成。

**構成（3ブロック）**
1. **ソース**: グラデ球体ジェネレータ（色2–3個・位置・ぼかし・グロー）／画像／動画（effect-stackと同じ入力系）
2. **ガラス**: Paper Shaders Fluted Glass 互換のパラメータセット
   - 縞: `本数(size)` / `角度` / `縞形状 lines|wave|zigzag`
   - 歪み: `プロファイル prism|lens|contour` / `歪み量` / `stretch` / `shift`（全て0–1）
   - 光: `色収差` / `ハイライト` / `シャドウ`
   - 仕上げ: `ブラー` / `グレイン`
3. **書き出し**: PNG（解像度指定）／WebM録画／設定URL共有（クエリシリアライズ）／シード

**差別化候補**（既存ツールで面倒な組み合わせ）
- 縦縞×横縞の重ね掛け（2パス）
- マウス追従で歪み中心・球体が動く
- アニメ: `speed` + ループ周期（WebM完全ループ書き出し）

---

## 5. 主要ソース

- Paper Shaders: https://shaders.paper.design / https://github.com/paper-design/shaders / docs: https://paper-design-shaders.mintlify.app
- Unicorn Studio docs: https://www.unicorn.studio/docs/
- ShaderGradient: https://github.com/ruucm/shadergradient
- Reeded glass Photoshopチュートリアル（歪み手法の原典）: https://design.tutsplus.com/tutorials/how-to-create-a-reeded-glass-photo-effect-in-photoshop--cms-109005
- 屈折・色収差シェーダー解説: https://blog.maximeheckel.com/posts/refraction-dispersion-and-other-shader-light-effects/
- Liquid Glass WebGL実装（日本語）: https://zenn.dev/orectic/articles/liquid-glass-webgl-refraction
- liquidglassライブラリ: https://github.com/ybouane/liquidglass
- スタイル呼称の流通元: https://pixelbuddha.net/textures/3337-fractal-glass-gradients
- GANSlider（スライダー数の定量根拠）: https://arxiv.org/pdf/2202.00965
- UJI開発記（プリセット/ランダマイズ論）: https://excessivelyadequate.com/posts/uji.html
- 2025年WebGLツール総括: https://nerdy.dev/the-year-of-webgl-tools
