# MOTION LAB

アニメーション＆グラフィックツールの統合プラットフォーム。
すべて**ビルド不要**で、画像・動画の処理はブラウザ内で完結（サーバー送信なし）。基本は単体HTML、Three.jsを使うEgg Glassは専用フォルダに依存ファイルを同梱しています。WireframeはCDNライブラリ、Warp TypeはGoogle Fontsを読み込みます。

**→ 公開URL: https://bats5020.github.io/motion-lab/**

Glass Lab・Effect Stack・Halftone Labの録画は、対応ブラウザに合わせてWebMまたはMP4で保存します。録画の回帰確認: `node --test tests/recording.test.cjs`（Node.js 18以上）。実ブラウザの検証は[公開確認記録](docs/2026-09-16-motion-lab-release.md)を参照。

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
| [Halftone Lab](tools/halftone-lab.html) | raster | 画像・プロシージャルソースをハーフトーン／ディザ／ASCII化。メルト・消灯セル・アニメ＋動画録画・SVG／コード書き出し |
| [Effect Stack](tools/effect-stack.html) | raster | 14種のエフェクトを重ねがけして偶発的なポスターを生成。画像・動画ソース対応（リアルタイム適用＋動画録画）、ランダマイズ＋スタック刻印 |
| [Grid Stretch](tools/grid-stretch.html) | raster | 画像をグリッド分割してピクセルストレッチ。注釈オーバーレイ付きグリッチ |
| [Dither → SVG](tools/dither-svg.html) | raster | 画像を網点・ディザ・ドット化してSVG／PNGで書き出す |
| [Pixel Gradient](tools/pixel-gradient.html) | raster | メッシュグラデを土台にピクセル化・ポスタライズ・グレインで生成 |
| [Thermal Flow](tools/thermal-flow.html) | raster | 円形／四角形のサーモフレーム、流体グラデ、個別エフェクトとキーフレーム。透過・トリミング対応PNG、単体HTML、作品JSON、連番ZIP／ロスレスMOV（[機能と検証](docs/thermal-flow-studio.md)、[PC操作](docs/thermal-flow-ux.md)） |
| [Smearworks](tools/smearworks.html) | raster | 白黒ポートレートに放射ブラーと残像、楕円で残した顔の周りに色面。切り抜き・ハンドル操作、PNG書き出し（[設計メモ](docs/smearworks.md)） |
| [Heatmap Blur](tools/heatmap-blur.html) | motion | 4点グラデ（キーフレーム）のブラーマップでテキスト／炎／模様／画像を部分的にぼかし（動画にはプリセット配色のグラデーションマップをかける）、文字を1〜2字ずつ横に伸ばしながら輝度をヒートマップ配色に置換（AEの Compound Blur + Camera Lens Blur + Colorama 構成の再現）。配色・ブラー・動き・グレインを調整、PNG／1ループ動画書き出し |
| [Glass Lab](tools/glass-lab.html) | motion | グロー球体を型板ガラス越しに歪ませる fluted glass シェーダー（WebGL）。画像・動画ソース、プリセット＋ランダマイズ、動画録画、設定URL共有 |
| [ASCII Wave](tools/ascii-wave.html) | motion | 流体ノイズをASCII文字で描くアニメーション背景。カーソルインタラクション＋コード書き出し |
| [Image Switcher](tools/image-switcher.html) | motion | 複数画像でロゴOP・スライドを制作。中央揃え、テンポ・開始／終了の演出、動画／透過PNG／連番ZIP／単体HTML／作品JSON（[使い方・検証](docs/image-switcher.md)） |
| [Word Switcher](tools/word-switcher.html) | motion | 単語／SVGを切り替えるモーショングラフィック |
| [Warp Type](tools/warp-type.html) | motion | テキストをノイズで歪ませるジェネレーター。プリセット・PNG／WebM書き出し |
| [U19 Aberration](tools/u19-aberration.html) | motion | ロゴ・テキスト輪郭のサーモグロー。背景合成・ループWebM書き出し |
| [U19 Tile Scroll](tools/u19-tile-scroll.html) | motion | FigmaのHUDの組みで流れるU19ロゴタイルの帯でシーンA→Bをつなぐトランジション。ワイプの向き（初期値は右下→左上）・境目（サーモ色の液体＝MSI 2024の入り方／ブロック／列ごと／直線）、タイルの流れの緩急（スピードカーブ）、流れの位置と色の反転をAEと同じ感覚で打てるキーフレーム（自動で打ってから消す・動かすことも可）、サーモの配色（Heatmap Blurと同じ13種）、配色・角度・モーションブラー。AE風タイムライン、タイルだけの透過レイヤー、連番PNG（ZIP）／ロスレスMOV／MP4書き出し（[設計メモ](docs/u19-tile-scroll.md)） |
| [U19 HUD Sequence](tools/u19-hud-sequence.html) | motion | U19 ECSのHUDが立ち上がり、中央の線から角丸の映像ウィンドウが開くオープニング。中の映像だけ差し替え（選択／プレビューにドロップ、16:9以外は窓に合わせてトリミング）、1920×1080・30fps のMP4（H.264・WebCodecs）をコマ送りで書き出し。尺は HUD 3.4秒＋映像＋0.5秒 |
| [Flame Transition](tools/flame-transition.html) | motion | サーモカラーの炎で画面を覆ってシーンA→Bへ切り替えるトランジション（WebGL）。渦・一方向・両側から、映像同士／ロゴ出し、U19系の配色、タイムライン、炎だけの透過レイヤー、ロスレスMOV／MP4（[設計メモ](docs/flame-transition.md)） |
| [Wireframe](tools/wireframe.html) | motion | ジオメトリックなワイヤーフレーム系モーショングラフィック |

## シーン（案件用のアニメーション）

ツールではなく、案件のFigmaを組んだ完成形のアニメーション。`scenes/` に単体HTMLで置く。映像などの素材があるものはフォルダにして `index.html` と同梱（ハブのカードには出さない）。Adobe Fontsのキット（`yhz3hqi`）は登録ドメインの `bats5020.github.io` で表示される。

| シーン | 何か |
|---|---|
| [U19 Registration Deadline](scenes/u19-registration-deadline.html) | U19eスポーツ選手権2026「エントリー期限」（Figma 992:11263）。HUDが立ち上がり、3.4秒で枠が中央の線から開いて、Thermal Flowの背景（8秒ループ）とコピーが見える。クリック／Rキーで再生し直し |
| [U19 ECS HUD Sequence](scenes/u19-ecs-hud-sequence/) | U19 ECS のHUDが立ち上がり、3.4秒で中央の線から映像ウィンドウ（角丸、試合映像3.9秒）が開く元のシーケンス。映像はフォルダ内の mp4／webm。クリック／Rキーで再生し直し。右下の「● MP4を書き出す」で 1920×1080・30fps の MP4（H.264・WebCodecs、コマ送りで描画するので取りこぼしなし）を保存 |

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
