# CODEX_HANDOFF — motion-lab（AI引き継ぎ用）

2026-10-29作成（Claude Codeセッションより）。前回の引き継ぎ `CLAUDE_HANDOFF.md`（2026-10-08生成）は§7「クローンが8コミット遅れ・未コミット変更あり」の警告が**既に古い**ので無視してよい。それ以外（§1〜6のアーキテクチャ・ツール一覧・規約）は今も概ね有効。本書が最新。

## 0. 大前提（必読ルール）

- ルールの正本: `AGENTS.md` → `../../CLAUDE.md`（maoの働き方メモ）と、この`README.md`の「運用ルール」。
- **mainへ直接push禁止・必ずPR経由・force push絶対禁止**。作業は必ず最新 `origin/main` からブランチを切る。
- 既存PRブランチの更新が必要な場合もrebase+force pushではなく、**mainをマージコミットで取り込む**（今回PR #39で実施した方式）。
- デザイントークンは `shared/tokens.css` を再利用、新設しない。1ツール=1HTML（kebab-case）、UIラベルは日本語可・ファイル名/タイトルは英語。
- 「完了」と言う前に実ブラウザ検証の証跡を残す（本書§5参照）。

## 1. 現在の状態（2026-10-29時点）

- このクローン（`labs/motion-lab`）: `main` ブランチ、**origin/main（v1.12, `6ff3c31`）と同期済み・クリーン**。
- 旧作業の退避: 2026-09-13頃の未コミット作業一式は全てupstream反映済みの重複と確認済みで、ローカルブランチ `backup/stale-worktree-20261029` に退避してある。**復元・再利用は不要**（触らなくてよい）。
- untrackedのローカル限定ファイル: `CLAUDE_HANDOFF.md`、`CODEX_HANDOFF.md`（本書）、`docs/ticket-web-references.md`（チケットWebデザイン調査メモ、未コミット）。コミット対象に巻き込まないこと。
- 別クローン `labs/motion-lab-line-flow`: 同一リポジトリの別worktree。ブランチ `codex/line-flow-20260927` に **Line Flowツール（2026-09-27完成・検証済み）が未コミット・未PRのまま**残っている。

## 2. PRの状況

| PR | 状態 | 備考 |
|---|---|---|
| #39 U19 HUD Sequence「HUDのみ」 | **解消済み・MERGEABLE/CLEAN** | 2026-10-29にmain(v1.12)をマージコミットで取り込みコンフリクト解消済み（詳細§3）。**マージ実行はmaoの判断待ち — 勝手にマージしない** |
| #9 渦ピン半径の上限150（Thermal Flow） | オープン・コンフリクトなし | 10/14から放置。内容検証すればマージ候補 |

## 3. 直近の作業内容（PR #39コンフリクト解消 — 2026-10-29）

mainはPR #40で全ツールのワークベンチ刷新＋`exportMp4`堅牢化（単発実行・確実クリーンアップ）済みだったため:

- `exportMp4` は**main側の新実装を採用**し、HUDのみ機能の3差分だけ移植: ①尺=映像の長さ ②開始位置=`mt.startTime()+mt.totalDuration()` ③ファイル名に`-hud`。
- ワークベンチ初期化を3セクション構成に追従（「02 — 始まり方」挿入でズレた見出しリネーム・書き出しジャンプ・フォールバック表示を最終セクション参照に修正）。
- モード切替ガードを `EX.on || EX.pending` に拡張。
- テスト追従: `tests/motion-qa-fixes.test.cjs` のVMモック環境に `frameOnly:false` と `mt.totalDuration` を追加、`tests/fixtures/motion-ui-preservation.json` のエンジンSHA256を更新。
- 検証: `node --test` 401件中400合格＋実ブラウザ12項目合格（PRコメント参照: HUDのみ116コマ/-hud名、オープニングあり233コマ、ダイアログ尺表示のモード連動、書き出し中ロック、中止復帰、JSエラー0）。

## 4. 残タスク候補（優先度順の提案）

1. **mainの赤テスト修正（小・最優先候補）**: `node --test tests/*.test.cjs` で `smearworks: original inline engine/export code unchanged` が**main時点で失敗**している。原因はPR #41（Smearworks VALOパレット追加）がSHA固定fixture（`tests/fixtures/raster-ui-baseline.json` 内のsmearworksエントリ）を未更新のまま。修正方法は§6参照。1行修正の小PR。
2. **PR #9の検証とマージ準備**: 渦ピン半径上限150。Thermal Flowで動作確認し、マージ判断材料をmaoへ。
3. **Line Flow統合（中〜大）**: クローン#2の未コミット作業を最新mainへ。ベースがv1.8なのでPR #40のワークベンチ/統合書き出しダイアログへの追従が必要。設計は `labs/motion-lab-line-flow/docs/line-flow.md` が正本。
4. **PR #39の「シーケンスの構成」帯（任意・maoに確認してから）**: プレビュー下の帯（01 HUD 3.4秒／02 差し替え映像／03 余韻 0.5秒）が「HUDのみ」モードでも変わらない。モード連動させるかはmaoの好み次第。
5. 2026-09-05監査の残TODO（`docs/2026-09-05-tool-audit.md`）: PR #40でかなり解消されている可能性が高いので、**着手前に現状と照合**すること。

## 5. 検証環境（実測で判明している注意点）

- ユニットテスト: `node --test tests/*.test.cjs`（依存ゼロ、どのNodeでも可）。現在400/401合格が正常（残1件は§4-1の既知の赤）。
- 実ブラウザ検証: Playwright 1.62.1 が `~/.npm/_npx/705bc6b22212b352/node_modules/playwright` にある。**Node 20+必須 — デフォルトのnvm nodeは18.17.1で動かない**。`~/.nvm/versions/node/v23.10.0/bin/node` を使う。Chromiumバイナリはキャッシュ済み。
- 動画検証: `ffprobe -count_frames` でコマ数確認（homebrewにffmpeg/ffprobeあり）。
- ツールはHTTP経由で開く（`python3 -m http.server` 等。file://だと動画読込やダウンロードが動かない）。
- 検証証跡は `/tmp` 系のQAディレクトリに `report.json`＋スクショで残し、PR本文/コメントに結果を書く（リポジトリにはコミットしない）のが既存パターン。

## 6. ハマりどころ（重要な仕組み）

- **SHA固定ガードテスト**: 各ツールのエンジン部（インラインscript）はfixtureのSHA256と照合される（`tests/fixtures/motion-ui-preservation.json`、`raster-ui-baseline.json`、`material-ui-baseline.json`、`type-shape-baseline.json`）。正当な機能変更でもSHAがズレて赤になるので、**変更時はfixtureのSHAを更新するのが正規手順**。ハッシュ計算はテスト自身のロジックと同じ手順で行うこと: `QA_FIX_BEGIN/END` ブロックを `tests/fixtures/motion-qa-fixes.json` の原本に戻し、`ML_KEYBOARD_BEGIN/END` ブロックを `tests/fixtures/motion-keyboard-patches.json` で置換してからSHA256。fixture全体を整形し直さず、**該当SHA文字列だけをピンポイント置換**する（フォーマット差分でdiffが汚れる）。
- **QA_FIXリージョンはVMでモック実行される**: `tests/motion-qa-fixes.test.cjs` が `exportMp4` 等を実際に実行する。リージョン内に新しい自由変数を導入したら、テストのモック環境（`env={...}`）にも追加しないとReferenceErrorで一連のテストが落ちる。
- **統合書き出しダイアログ**: PR #40以降、各ツールの「書き出し↗」ボタンは共通ダイアログ `#mlUnifiedExport`（`shared/export-workbench.js`＋`shared/export-motion.js` ほか）を開く。ツール登録は `export-motion.js` 等のツール別分岐にあり、実際の書き出しは元のボタン（例: `#exBtn`）へのプロキシ。Playwrightでは**このダイアログが開くとポインタを遮る**ので、閉じてから他要素をクリックすること。
- **ワークベンチshellスクリプト**（`data-ml-shell="motion"` 等）はSHA対象外だが、セクション数・ID存在の前提を持つ。セクションを追加/削除するツール変更ではshell側の `sections[n]` 参照を確認。
- U19系アセット（`tools/assets/u19-kv.jpg`、`scenes/`配下など）はクライアント支給素材。MITライセンスの対象外、他用途への流用禁止。

## 7. 今日の成果物の所在

- PR #39解消コミット: `2b34132`（origin/feat/u19-hud-sequence-frame-only）。解消方針の全文はコミットメッセージとPRコメントにあり。
- 退避ブランチ: `backup/stale-worktree-20261029`（ローカルのみ、復元用。通常は触らない）。
