# 未反映更新の公開確認 — 2026-09-16

## 正本と公開対象

実装の正本は `tools/`、ハブの掲載情報は `index.html` の `TOOLS`。公開サイトは GitHub Pages の `main` を使用する。

ローカルの全ブランチ・作業場所と最新 `origin/main` を照合した。Thermal FlowはPR #5で先に公開済み。続けて、次の未反映更新を `eb05ce1` から作成した `codex/publish-motion-lab-updates-20260916` に集約した。

| 対象 | 今回の内容 |
|---|---|
| Image Switcher | 画像の切り替えでロゴOP・スライドを作る独立ツール。10種類の切り替え、開始／終了演出、動画・PNG・連番ZIP・単体HTML・作品JSON保存。ハブにもカードを追加 |
| Glass Lab / Effect Stack / Halftone Lab | MP4保存時の拡張子修正。録画開始失敗・非同期エラー・停止待ちの連打・空ファイルの処理と、タイマー・トラック・操作状態の復帰 |
| U19 Aberration | WebM対応確認とVP8候補追加。録画開始失敗後にロックが残る問題、停止後の状態・トラックの後処理 |
| Effect Stack | 実録画で見つかった、巻き戻し時に描画が停止する問題も修正。動画の `playing` / `seeked` で描画を再開 |
| README | Image Switcherと掲載漏れのWarp Type / U19を追記。外部依存と動画保存形式を実装に合わせて修正 |

Egg Glassの既存更新とThermal Flowの公開内容は最新mainのまま保持。元の作業場所の未コミットファイルは残している。参照サイトのコード・画像・動画は公開対象に含めない。

## 検証

- `node --test tests/recording.test.cjs`：40件合格。録画ライフサイクルの異常系と、ハブ・全単体HTMLツールのJavaScript構文を検証。
- `tests/image-switcher.browser.cjs`：Chromiumで9項目合格。1440×1000／1280×800、画像読み込み、全切り替え、透過、ループ、Undo／Redo、実際の動画・PNG・ZIP・HTML保存、JSON復元、キャンセルを確認。JavaScriptエラー0件。
- `tests/recording.browser.cjs`：Chromium・WebKitで4ツールを2回ずつ録画し、16本のWebMをffmpegで全フレーム復号。複数の異なるフレーム、320×240（Halftoneは320×200）、録画後の操作復帰とトラック停止を確認。JavaScriptエラー0件。
- WebKitでWebM非対応を模擬し、Glass Lab / Effect Stack / Halftone LabのMP4を2回ずつ実エンコード。6本ともH.264のMP4として復号でき、拡張子・画角・動くフレーム・操作復帰を確認。WebM専用のU19は未対応通知後に録画状態が残らないことを確認。
- Effect Stackは修正前に巻き戻し後の描画が止まり、1フレームの動画になることを再現。修正後はChromiumで30フレーム、WebKitで29フレームの1秒動画を連続保存できた。
- `git diff --check`：合格。

録画確認はPlaywrightのChromiumとWebKitによるもの。製品版Safariや高解像度・高負荷時のフレームレートは今回の検証範囲外。WebMはブラウザにより長さのメタデータを持たない場合があるため、全フレームの復号で確認した。

証跡は `/private/tmp/motion-lab-updates-qa/` 以下。`image-switcher/report.json` と画面キャプチャ、`recording/report.json` / `recording-mp4/report.json` と実録画ファイルを保存。Image Switcher再検証は2026-09-16T14:31:58Z、WebM検証は同14:34:25Zに完了。

## 再検証

PlaywrightのChromium／WebKit、ffmpeg／ffprobeを用意し、リポジトリをHTTPで配信して実行する。ffmpegで検証用動画を生成するため、外部素材は不要。

```sh
node --test tests/recording.test.cjs
MOTION_LAB_URL=http://127.0.0.1:8782 PLAYWRIGHT_MODULE=/path/to/playwright node tests/recording.browser.cjs
IMAGE_SWITCHER_URL=http://127.0.0.1:8782/tools/image-switcher.html PLAYWRIGHT_MODULE=/path/to/playwright node tests/image-switcher.browser.cjs
```

録画テストの出力先は `RECORDING_OUTPUT`、対象エンジンは `RECORDING_ENGINES`（既定 `chromium,webkit`）で変更できる。`RECORDING_MIME=video/mp4` を指定するとWebM非対応環境を模擬し、ブラウザ自身によるMP4エンコードを確認する。`FFMPEG` / `FFPROBE` で実行ファイルを指定可能。
