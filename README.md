# MOTION LAB

アニメーション＆グラフィックツールの統合プラットフォーム。
すべて**ビルド不要**で、画像・動画の処理はブラウザ内で完結（サーバー送信なし）。基本は単体HTML、Three.jsを使うEgg Glassは専用フォルダに依存ファイルを同梱しています。

**→ 公開URL: https://bats5020.github.io/motion-lab/**

## 構成

```
index.html          ハブ画面 — 全ツールをカード表示。ここが入り口
shared/tokens.css   共通デザイントークン（配色・フォント）
tools/              各ツール（基本は単体HTML、egg-glass/ はモジュール構成）
```

## ツール一覧

| ツール | カテゴリ | 何をするか |
|---|---|---|
| [Egg Glass](tools/egg-glass/) | motion | 卵形3Dの柄・ロゴ・照明・SVG背景を編集。スクロールキーフレーム、PNG／動画／単体HTML書き出し（[使い方・正本](tools/egg-glass/README.md)） |
| [Halftone Lab](tools/halftone-lab.html) | raster | 画像・プロシージャルソースをハーフトーン／ディザ／ASCII化。メルト・消灯セル・アニメ＋WebM録画・SVG／コード書き出し |
| [Effect Stack](tools/effect-stack.html) | raster | 14種のエフェクトを重ねがけして偶発的なポスターを生成。画像・動画ソース対応（リアルタイム適用＋WebM録画）、ランダマイズ＋スタック刻印 |
| [Grid Stretch](tools/grid-stretch.html) | raster | 画像をグリッド分割してピクセルストレッチ。注釈オーバーレイ付きグリッチ |
| [Dither → SVG](tools/dither-svg.html) | raster | 画像を網点・ディザ・ドット化してSVG／PNGで書き出す |
| [Pixel Gradient](tools/pixel-gradient.html) | raster | メッシュグラデを土台にピクセル化・ポスタライズ・グレインで生成 |
| [Thermal Flow](tools/thermal-flow.html) | raster | ドメインワープ×サーマルLUTで炎系グラデーションを生成。LUT編集・等温線バンド・スプレー溶解グレイン・最大8K PNG（設計: [docs/thermal-flow-design.md](docs/thermal-flow-design.md)） |
| [Glass Lab](tools/glass-lab.html) | motion | グロー球体を型板ガラス越しに歪ませる fluted glass シェーダー（WebGL）。画像・動画ソース、プリセット＋ランダマイズ、WebM録画、設定URL共有 |
| [ASCII Wave](tools/ascii-wave.html) | motion | 流体ノイズをASCII文字で描くアニメーション背景。カーソルインタラクション＋コード書き出し |
| [Word Switcher](tools/word-switcher.html) | motion | 単語／SVGを切り替えるモーショングラフィック |
| [Wireframe](tools/wireframe.html) | motion | ジオメトリックなワイヤーフレーム系モーショングラフィック |

各ツールの左下の **◆ MOTION LAB** ピルからハブに戻れます。Egg Glassは `@` で編集UIと一緒に非表示になります。

## ツールを追加する

1. `tools/` に kebab-case の単体HTMLを置く（例: `tools/noise-field.html`）
2. `index.html` の `TOOLS` 配列に1件追加（名前・説明・カテゴリ・サムネSVG）
3. `<body>` 直後にホームピル（既存ツールからコピー）を入れる
4. このREADMEの一覧に1行追記
5. 最新mainから作業ブランチを作り、レビュー・検証後にPRをマージ — GitHub Pagesに自動反映（mainへの直接push禁止）

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
