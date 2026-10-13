# Aberration Overlay — 開発状態メモ(AI引き継ぎ用)

最終更新: 2026-10-14(v1.9.1 ブラッシュアップ) / ブランチ: `codex/aberration-overlay-20261014`

## 何のツールか

画像・動画をアップロードし、MSI 2024(Studio Dumbar)系のサーモ/流体/歪みアニメーションをオーバーレイして動画化するツール。目標は「AEで作るようなアニメーションをWebツールで」。実装の正本は `tools/aberration-overlay.html`(単体HTML・約1900行)。回帰テストは `tests/aberration-overlay.browser.cjs`。

参考にした一次情報:
- UX: Photomosh(大ランダム+少数スライダー)、Unicorn Studio(エフェクトスタック/置いた瞬間動く)、Jitter(サムネ付きプリセット/書き出し常設)
- 画質: inferno/turbo多項式(知覚均等LUT)、IQ式ドメインワープ、IGNディザ、ソフトニー疑似ブルーム、FLIR実機署名(FPN/等温線)

## アーキテクチャ(v3)

- **`createEngine()`** — GLエンジン全体を自己完結クロージャ1関数に封じている。輝度ブラー前段(THERMAL/EDGE有効時のみ: メディア輝度→1/2・1/4・1/8ミップ→用途別に分離ガウス) → シーン(全エフェクト1パス) → 輝度抽出 → 1/2・1/4・1/8の3段ガウスピラミッド → 合成(実ブルーム加算+ACES+ビネット+グレイン+IGNディザ)。**コード書き出しは `createEngine.toString()` をそのまま埋め込むことでWYSIWYGを保証**している。エンジンに手を入れたら書き出しも自動で追従する設計。
- **エフェクトスタック**(排他でなく重ねがけ): WARP(渦+LIC風スメア) → THERMAL(メディアのサーモ化) → EDGE GLOW(DoGエッジ) → FLUID BLOB(fbm3×2段ワープ+擬似法線ライティング) → HUD(Canvas2Dで合成後に描画)
- **プリセット8種**は実メディアでエンジンを回してサムネイル生成(`renderThumbs`、2倍描画→縮小)
- **レンダーキュー**(`renderVideo`): フレーム正確に1枚ずつ描画。WebCodecs(VP9)+CDNの`webm-muxer@5.0.3`で32/16Mbpsエンコード。非対応環境はMediaRecorder(captureStream(0)+requestFrame)にフォールバック。モーションブラーはサブフレーム(最大6)の蓄積平均。動画ソースはフレーム毎に`seeked`待ちでシーク
- **輝度ブラー**: 輝度は `enc()` でR=上位8bit・G=下位8bitにパック(線形なので補間・畳み込みに安全)。8bitターゲットでもDoGエッジが段付かない。σがテクセル換算3を超えると1段下のミップで処理し、タップ数はσに応じて打ち切り(最大±12)。旧17タップ近似よりリング状のギザが消え、SwiftShader計測で10〜15%軽い。EDGEのゲインは真ガウス化に合わせて×1.12補正
- **WARP中心**: `state.warp.cx/cy`(0〜1、yは上向き)。WARP有効時にプレビューをドラッグで指定、ランダマイズでは0.3〜0.7
- **トランスポート**(ステージ下部): 再生/一時停止(Space、ソース動画も連動)・ループ位置スクラブ(ドラッグで一時停止)・プレビュー解像度 HQ/1/2/1/4(localStorage保存、書き出しは常にフル)。キャンバスのCSS表示サイズは描画解像度と分離(`setViewCss`)、右下は実測fps
- **レンダー**: `pickVideoCodec` でVP9(level 5.1→4.1→1.0)→VP8を `isConfigSupported` で事前チェック。エンコーダエラーは中止と区別して表示。残り時間表示。レンダー中は `body.rendering` でパネル・PNG/コード/URL・トランスポート・ソース差し替え・ショートカットをロック
- プリセット適用後に見た目系の値を触ると選択表示を解除(`watchDirty`)
- デモ画像を起動時に自動生成・ロード(`makeDemoImage`)
- 状態は単一の`state`オブジェクト。URL共有(`#s=`base64)、プリセットは部分マージ

## 検証済み(2026-10-14、ヘッドレスChrome+SwiftShader)

v1.9.1: `tests/aberration-overlay.browser.cjs` 全PASS(起動/プリセット解除/一時停止・スクラブ/プレビュー解像度/WARPドラッグ/コード書き出し画素差0/動画ソース/レンダー完走/SPレイアウト)。WebCodecs経路(CDNをローカルのwebm-muxerに差し替え)で320×180・24fps・72/72フレーム、1080pレンダーの中止も確認。旧版と全8プリセットを同時刻で並べて見た目の傾向が一致することを確認
実行: `python3 -m http.server 8766 &` → `node tests/aberration-overlay.browser.cjs`(SwiftShaderなら `CHROMIUM_ARGS="--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader"`)

v1.9:

- 起動/実ブルーム/ACES/8サムネ生成、メディア差し替え時のサムネ再生成
- レンダーキュー完走: 320×180・3秒・24fps=72フレームをWebCodecs経路でエンコードし `video/webm` 736KBのBlob生成まで確認
- コード書き出し: エンジン埋め込み単体HTMLがブルーム込みで本体と同一描画

## 既知の注意点・チューニング余地

- プレビューの重さはシーンパスのfbmが支配的。重い環境はトランスポートの1/2・1/4で回避(自動で落とすAUTOは未実装)
- MediaRecorderフォールバック経路はフレーム落ちがありうる(CDN不通時に72→68を確認)。WebCodecs経路は正確
- Playwright同梱ChromiumはH.264非対応のため、テスト素材はVP9 WebM
- レンダーキュー中のreactiveテンポは決定論化のため等速扱い(`tEvoAt`)
- 動画ソースのレンダーは毎フレームシークするため実時間より遅い(正確性優先)
- FLUID BLOBのライティングは`OES_standard_derivatives`前提(無い環境ではフラット)

## 次にやると決めている方向(未着手)

**タイムライン/キーフレーム**(AE化の本丸)。構想: 主要パラメータ(各エフェクトの強度・ミックス等)に絞ったキーフレームトラック+イージングプリセット(Easy Ease相当のベジェ数種)+下部スクラバー。`state`を「時刻→補間済みstate」に解決する`stateAt(t)`層を挟めば、ライブループ/レンダーキュー/書き出しの3経路すべてに同じ仕組みが乗る。

## 運用

- このブランチは`origin/main`から分岐したworktree(`motion-lab-aberration-overlay/`)で作業。mainへはPR経由
- CDN依存はレンダー時の`webm-muxer`のみ(README冒頭に注記済み)。それ以外は依存ゼロ単体HTML
- 1つ前の世代(v2・シングルパス)のバックアップはセッションのscratchpadにのみ存在(リポジトリ外)
