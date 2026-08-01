# MOTION LAB

アニメーション＆グラフィックツールの統合プラットフォーム。
すべて**ビルド不要・依存ゼロの単体HTML**で、ブラウザ内処理のみ（サーバー送信なし）。

**→ 公開URL: https://bats5020.github.io/motion-lab/**

## 構成

```
index.html          ハブ画面 — 全ツールをカード表示。ここが入り口
shared/tokens.css   共通デザイントークン（配色・フォント）
tools/              各ツール（1ツール＝1ファイル）
```

## ツール一覧

| ツール | カテゴリ | 何をするか |
|---|---|---|
| [Halftone Lab](tools/halftone-lab.html) | raster | 画像・プロシージャルソースをハーフトーン／ディザ／ASCII化。アニメ＋WebM録画・SVG／コード書き出し |
| [Dither → SVG](tools/dither-svg.html) | raster | 画像を網点・ディザ・ドット化してSVG／PNGで書き出す |
| [Pixel Gradient](tools/pixel-gradient.html) | raster | メッシュグラデを土台にピクセル化・ポスタライズ・グレインで生成 |
| [Word Switcher](tools/word-switcher.html) | motion | 単語／SVGを切り替えるモーショングラフィック |
| [Wireframe](tools/wireframe.html) | motion | ジオメトリックなワイヤーフレーム系モーショングラフィック |

各ツールの左下に **◆ MOTION LAB** ピルが常駐し、ハブに戻れます。

## ツールを追加する

1. `tools/` に kebab-case の単体HTMLを置く（例: `tools/noise-field.html`）
2. `index.html` の `TOOLS` 配列に1件追加（名前・説明・カテゴリ・サムネSVG）
3. `<body>` 直後にホームピル（既存ツールからコピー）を入れる
4. このREADMEの一覧に1行追記
5. `git add -A && git commit && git push` — GitHub Pagesに自動反映

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
