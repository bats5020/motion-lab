# MOTION LAB

アニメーション＆グラフィックツールの統合プラットフォーム。
**ビルド不要のHTMLツール集**。画像・動画の加工はブラウザ内で行います。
多くは外部ライブラリ不要ですが、WireframeはCDNのThree.js／JSZip／gif.js、Warp TypeはGoogle Fontsを読み込みます。

**→ 公開URL: https://bats5020.github.io/motion-lab/**

## 現状・正本

- 12ツール。実装の正本は `tools/*.html`、ハブ掲載情報は `index.html` の `TOOLS`。
- Thermal Flowに枠に沿って発光する「サーモフレーム」（四角形／円形・円の外側の透過・上下左右の個別調整・流れる炎・再生／静止画の瞬間選択）、四隅から中央へ炎を伸ばす「四隅フレア」、溶融系3ルック、マスク静止画保存時の自動トリミングを追加。書き出しのグラデーションを高精度化し、粒感・追加ノイズの初期値は0。PC向け操作を整理し、グラデ編集・個別エフェクト・キーフレーム・作品JSON・PNG連番／ロスレスMOV出力を追加。現行機能と検証: [制作機能の記録](docs/thermal-flow-studio.md)、[操作整理の記録](docs/thermal-flow-ux.md)。
- [2026-09-05 解析・改善記録](docs/2026-09-05-tool-audit.md)：録画安定性の修正と次の改善候補。
- 回帰確認：`node --test tests/recording.test.cjs`（Node.js 18以上・追加依存なし）。実エンコードとGPU描画は別途ブラウザ検証が必要。

## 構成

```
index.html          ハブ画面 — 全ツールをカード表示。ここが入り口
shared/tokens.css   共通デザイントークン（配色・フォント）
tools/              各ツール（1ツール＝1ファイル）
```

## ツール一覧

| ツール | カテゴリ | 何をするか |
|---|---|---|
| [Halftone Lab](tools/halftone-lab.html) | raster | 画像・プロシージャルソースをハーフトーン／ディザ／ASCII化。メルト・消灯セル・アニメ＋WebM録画・SVG／コード書き出し |
| [Effect Stack](tools/effect-stack.html) | raster | 14種のエフェクトを重ねがけして偶発的なポスターを生成。画像・動画ソース対応（リアルタイム適用＋WebM録画）、ランダマイズ＋スタック刻印 |
| [Grid Stretch](tools/grid-stretch.html) | raster | 画像をグリッド分割してピクセルストレッチ。注釈オーバーレイ付きグリッチ |
| [Dither → SVG](tools/dither-svg.html) | raster | 画像を網点・ディザ・ドット化してSVG／PNGで書き出す |
| [Pixel Gradient](tools/pixel-gradient.html) | raster | メッシュグラデを土台にピクセル化・ポスタライズ・グレインで生成 |
| [Thermal Flow](tools/thermal-flow.html) | raster | 流体リボンと6種のグラデ・変形エフェクト・キーフレームでグラフィックと動画を制作。作品JSON・PNG／JPG／WebP・連番ZIP／MOV（機能: [docs/thermal-flow-studio.md](docs/thermal-flow-studio.md)） |
| [Glass Lab](tools/glass-lab.html) | motion | グロー球体を型板ガラス越しに歪ませる fluted glass シェーダー（WebGL）。画像・動画ソース、プリセット＋ランダマイズ、WebM録画、設定URL共有 |
| [ASCII Wave](tools/ascii-wave.html) | motion | 流体ノイズをASCII文字で描くアニメーション背景。カーソルインタラクション＋コード書き出し |
| [Word Switcher](tools/word-switcher.html) | motion | 単語／SVGを切り替えるモーショングラフィック |
| [Warp Type](tools/warp-type.html) | motion | テキストをノイズで歪ませるジェネレーター。プリセット・PNG／WebM書き出し |
| [U19 Aberration](tools/u19-aberration.html) | motion | ロゴ・テキスト輪郭のサーモグロー。背景合成・ループWebM書き出し |
| [Wireframe](tools/wireframe.html) | motion | ジオメトリックなワイヤーフレーム系モーショングラフィック |

録画はWebMを基本とし、Glass Lab・Effect Stack・Halftone Labはブラウザの対応状況によりMP4で保存します。

各ツールの左下に **◆ MOTION LAB** ピルが常駐し、ハブに戻れます。

## ツールを追加する

1. `tools/` に kebab-case の単体HTMLを置く（例: `tools/noise-field.html`）
2. `index.html` の `TOOLS` 配列に1件追加（名前・説明・カテゴリ・サムネSVG）
3. `<body>` 直後にホームピル（既存ツールからコピー）を入れる
4. このREADMEの一覧に1行追記
5. 最新 `origin/main` から作業ブランチを作成して変更し、確認後にPR経由でmainへ反映する（mainへ直接push・force push禁止）

新カテゴリは「出力の種類」で足す（例: `type`＝文字組み、`color`＝配色）。

## 運用ルール

- **命名は英語・kebab-case**、`-tool` / `-studio` などの接尾辞は付けない
- **1ツール＝1ファイル**の依存ゼロを維持。ライブラリが要る場合のみ専用フォルダを切る
- **配色は `shared/tokens.css` に合わせる**（ダークUI統一）
- UIラベルは日本語のままでOK。ファイル名・タイトルは英語統一

## 出自

- Halftone Lab は [bats5020/halftone-lab](https://github.com/bats5020/halftone-lab) から統合（本家も継続公開中）
- その他4ツールはローカルの design-tool コレクションから移設

## ライセンス

MIT
