# Thermal Flow — 炎系サーマルグラデーション生成ツール 設計書

作成: 2026-08-16 ／ 対象: motion-lab 新ツール `tools/thermal-flow.html`

## 1. 参考画像の分析

提供された15枚は全て同一のパイプラインで説明できる:

```
スカラー場 T(x,y) ∈ [0,1]（温度場）
  → ドメインワープ（ノイズでノイズを歪める）
  → 1Dカラー LUT（グラデーションマップ）で着色
  → グレイン／ディザ
  → （任意）紙テクスチャ・スプレー溶解・タイポグラフィ
```

違いは「場の形」「LUTの色と硬さ」「グレインの掛け方」の3軸だけ。4系統に分類:

| 系統 | 該当画像 | 特徴 | 再現パラメータ |
|---|---|---|---|
| **A. ソフトサーマル** | 黒×橙のブロブ、teal×橙の縦炎、cura、青系ブラー | 場がなだらか、LUTストップも滑らか。黒→深紅→橙→クリームの王道ランプ | 低ワープ・低周波の場＋広いストップ＋弱グレイン |
| **B. リキッドクローム／フリンジ** | 赤黄の炎舌、オーロラ多色、黒地に橙青紫、teal×赤パック | 尖ったカスプ（折り目）と細い色の縁取り。細部がシャープ | 強ワープ＋**幅の狭いLUTストップ**（細帯が縁取りになる）＋縦異方性 |
| **C. グレイニー・オーラ** | 青炎×赤芯、ピンク×橙渦、Submorphics | フィルムグレインが全面に強く乗る。白飛び部にブルーム | 中ワープ＋輝度依存グレイン大＋ハイライト圧縮 |
| **D. スプレー溶解／ポスター** | BOMBA、Static Surge | グラデ中間調が**粒子の密度**に変換される（確率的ディザ）。紙質感・スプラッタ・文字と一体 | 場の値=ドット出現確率のステイプル溶解モード＋紙テクスチャ |

重要な観察:
- 「炎らしさ」の核心は色ではなく **1D LUT に通すこと**。同じ場でも LUT を替えるだけで thermal / aura / chrome に化ける
- B系統の「細い縁取り」はジオメトリではなく **LUT 内の幅の狭い色帯** が等値線に沿って現れたもの
- D系統のザラザラは後がけノイズではなく **場の値をディザ閾値に使った溶解**（BOMBA のスプレー境界）
- 全画像に共通してバンディングが無い → float で場を作りディザ後に量子化している

## 2. リサーチ結論（要点）

- 「ドメインワープ × thermal LUT × グレイン × 高解像度書き出し」を1つで満たす Web ツールは**現存しない**（ツール空白地帯）。デザイナーは今も Photoshop の Gradient Map ワークフローで作っている
- 最接近は [Paper Shaders / Grain Gradient](https://github.com/paper-design/shaders)（OSS・シェーダー参考に最良）と [MagicPattern Shader BG](https://www.magicpattern.design/tools/shader-background-generator)（Bayerディザ＋grain持ち）。どちらも LUT 編集・bands・輝度依存グレインを持たない
- 技術の定石: IQ の [domain warping](https://iquilezles.org/articles/warp/)（`f = fbm(p + s2*fbm(p + s1*fbm(p)))`）＋ LUT は [Shadertoy の colormap 多項式](https://www.shadertoy.com/view/WlfXRN)や [glsl-colormap](https://github.com/glslify/glsl-colormap) が流用可
- バンディング対策は**量子化前の blue-noise / Bayer ディザ**が正解（[frost.kiwi の解説](https://blog.frost.kiwi/GLSL-noise-and-radial-gradient/)）。後がけ不可。グレイン0でも常時オン
- SVG フィルタ系（feTurbulence）は大面積で CPU が破綻 → **WebGL 一択**
- エクスポートのベストプラクティスは「4K+ PNG（タイルレンダ）＋ループ WebM ＋ パラメータの URL シリアライズ」

## 3. ツール設計

### 3.1 基本方針

- **名前**: `thermal-flow`（tools/thermal-flow.html、カテゴリ raster）
- motion-lab 規約に従い **依存ゼロ単体 HTML**。WebGL1 単一フラグメントシェーダー（glass-lab.html の構成を踏襲: `preserveDrawingBuffer`、`MediaRecorder` WebM、`toBlob` PNG、設定URL共有）
- 全パラメータを URL クエリにシリアライズ（共有・プリセット・リロード復元を一挙解決）

### 3.2 レンダリングパイプライン（1パス GLSL）

```
uv → [場の生成] → T ∈ [0,1] → [LUT 1Dテクスチャ] → RGB → [ポスト] → 出力
```

**① 場の生成（fieldMode）**
- `warp` — 純ドメインワープ FBM（系統A/B/Cの土台）
  - simplex 3D ノイズ（z=time でアニメ）、octaves 1–6
  - `q = fbm(p); r = fbm(p + w1*q + flow*t); T = fbm(p + w2*r)`
  - パラメータ: scale（周波数）、warp1/warp2 強度、octaves、**anisotropy**（縦伸縮 — 炎の舌はY方向ストレッチで出る）、flow 方向
- `flame` — 縦炎モード（cura / teal縦炎 / 系統D縦筋）
  - 下端からの高さ減衰 `base = 1 - y` に山型リッジ（数本のガウス峰）を掛け、高さに比例してワープ強度を増す
  - パラメータ: 峰の本数・鋭さ・高さ、ゆらぎ
- `blob` — メタボール（黒×橙ブロブ / 青系ブラー / Submorphics）
  - ドラッグ可能な点（2–8個、各半径・強度±）の距離場合成 → 軽ワープ
- 共通: T のレベル補正（gamma / contrast / offset）
- 共通（v1.1追加）: **うねり（curl）／上昇（rise）** — 滑らかな2オクターブのカールノイズ場（舌幅相当の固定周波数）を4ステップのストリームライン積分で移流。渦の巻き込みと上方向の流れを付与。curl強度は高さに比例させ炎の舌先ほど巻く
- 共通（v1.2追加）: **渦ピン** — キャンバスクリックで最大6個。Photoshopの渦巻きフィルタ相当の局所回転（二乗減衰、半径・回転角±をピンごとに指定、ドラッグ移動）。巻き込みの「場所」を作者が決められる
- 仕上げ（v1.2追加）: **背景グラデ** — 低温部（T<しきい値）を2色縦グラデーションに置換し図と地を分離

**② カラー LUT（このツールの主役）**
- 編集可能グラデーションストップ（2–8個、位置・色・**硬さ**）→ 256×1 テクスチャ化
- ストップの「硬さ」で滑らか⇄フリンジ（幅の狭い帯）を連続制御 — 系統Bの縁取りはここで作る
- プリセット: `flame`（黒→深紅→#c81400→#ff6a00→#ffd27a→クリーム）、`thermal`（紺→teal→紫→赤→黄→白）、`aura`（黒→青→シアン→赤芯）、`chrome`（黒地＋細帯橙/青/紫）、`bomba`（赤→橙→クリーム）、inferno / turbo / blackbody
- **bands**: LUT を N 段に量子化（サーマルカメラの等温線ルック）
- invert / offset（LUT を回してカラーサイクル）

**③ ポスト処理**
- **ディザ**: blue-noise（テクスチャ生成 or IGN: interleaved gradient noise）を量子化前に常時 ±0.5/255 加算
- **グレイン** 3モード:
  - `film` — 一様フィルムグレイン（量・粒サイズ・彩度ノイズ有無・静止/アニメ）
  - `shadow` — 輝度依存（暗部/中間調に強く乗る銀塩風、系統C）
  - `dissolve` — **T をそのまま出現確率にした確率的溶解**（系統D、BOMBA のスプレー境界）。粒サイズ＝1–3px、背景色（紙色）指定
- vignette、ハイライト圧縮（白飛びブルーム風）、紙テクスチャ（微細ノイズ＋わずかな色ムラ）

**④ アニメーション**
- time はノイズ第3軸に円環で乗せて**シームレスループ**（周期指定 2–20s）
- speed、flow 方向、一時停止

### 3.3 UI 構成（motion-lab ダークUI / tokens.css 準拠）

左: キャンバス（アスペクト: 1:1 / 4:5 / 9:16 / 3:4 / A判縦）
右パネル（セクション順 = 作業順）:
1. **プリセット** — 参考画像15枚に対応する look をワンクリック再現＋ランダマイズ🎲
2. **フィールド** — mode / scale / warp / octaves / anisotropy / 峰・ブロブ編集
3. **カラー** — LUT エディタ / プリセット / bands / invert / offset
4. **グレイン** — dither(常時) / grain mode・量・サイズ
5. **仕上げ** — vignette / ハイライト / 紙
6. **アニメ** — 再生 / 速度 / ループ周期
7. **書き出し** — PNG ×1/×2/×4（タイルレンダ、最大8K）/ WebM録画 / 設定URLコピー

### 3.4 品質担保の実装ノート

- ノイズ座標は **uv×scale 基準**（px基準にしない）→ 高解像度タイルレンダがプレビューと完全一致
- グレインだけは**出力解像度の物理px基準**で掛ける（拡大でグレインがボケるのを防ぐ）
- 高解像度書き出しは FBO タイル分割レンダ → canvas 合成 → toBlob
- float 精度: `precision highp float` 必須（モバイル mediump では場が割れる）

### 3.5 差別化ポイント（既存ツールに無いもの）

1. LUT ファーストクラス（編集・硬さ・bands・プリセット）
2. dissolve グレイン（スプレー溶解）
3. 参考画像ベースの look プリセット
4. 将来: **halftone-lab 連携** — T 場を halftone/dither モジュールへ分岐（thermal × 網点のリソグラフ風は完全に空白地帯）

## 4. ロードマップ

| フェーズ | 内容 |
|---|---|
| **v1** | warp/flame/blob 場 + LUT エディタ + bands + grain 3モード + PNG(タイル4K) + URL共有 + プリセット |
| **v1.5** | シームレスループアニメ + WebM 録画 + ブロブのドラッグ編集 |
| **v2** | テキスト/画像マスク入力（文字が燃える）、スプラッタ、halftone-lab ハイブリッド |

## 5. motion-lab への組み込み手順（README 準拠）

1. `tools/thermal-flow.html` 追加
2. `index.html` の TOOLS 配列に1件追加（raster）
3. ホームピル挿入、README 一覧に1行追記
