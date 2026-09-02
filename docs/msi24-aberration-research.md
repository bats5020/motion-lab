# MSI 24 "The Aberration" リサーチ — Studio Dumbar / League of Legends

調査日: 2026-08-23
参照: https://studiodumbar.com/work/msi-24 / https://youtu.be/ETQ9LME7UzQ

## プロジェクト概要

- Studio Dumbar/DEPT® が Riot Games と組んで制作した MSI 2024(成都開催)のイベントアイデンティティ。同スタジオ初のゲーミング案件。
- タグライン **"Become the Unknown"**。同時視聴ピーク 280万人。
- 納品物は単発のKVではなく **「ブランドキット」= ガイドライン + アセット + テンプレートの完全パッケージ**。Riot 側の多数の外部ベンダー(放送、SNS、会場、印刷、マーチ)がこのキットを使って展開した。
- Riot 側アートディレクター Stan Zienka の Behance によると、Riot がブリーフ/フィードバック/展開統括、Dumbar がキット制作という分業。
  https://www.behance.net/gallery/212675447/MSI-2024

## ビジュアルシステムの構成要素(4層)

1. **Typography** — 太く表情のあるタイポ。黒＋赤が基調のパレット
2. **The Aberration** — モーション言語の核。「未知」のグラフィック的解釈。
   公式説明: *"slow and ominous, sporadic and reactive, or more linear and up tempo"* —
   用途に応じてテンポ・振る舞いを変えられる、有機的・スペクトラルな流体ディストーション
3. **Journey Data** — 未来的な UI 風のテクスチャレイヤー(数値・座標・線)
4. **Empyrean Shapes** — LoL のロア由来のグラフィックアイコン群

この「レイヤーを重ねる設計」が展開力の源泉。Aberration(背景の流体グラデ)の上に
Journey Data(UI テクスチャ)と Empyrean Shapes(アイコン)とタイポを乗せれば、
誰が作っても MSI 24 に見える。

## 「ツールを作って展開」仮説の検証 → ほぼ正しい

- Studio Dumbar は「visual design, motion design, sound and **creative coding**」を掲げるスタジオで、
  **生成的ブランドツールを作って納品する**のが常套手段(NS、DEMO Festival などの前例)。
- モーション制作の主力は **Cavalry**(プロシージャルなモーションツール)。
  1つの Cavalry ファイルから無数のバリエーションを、フォーマット別に最適化して量産できる。
  Cavalry Control というクライアント配布用のパラメータ UI 仕組みもある。
  https://www.creativeboom.com/resources/why-cavalry-is-the-secret-weapon-of-the-worlds-best-design-studios/
- 補助的に Houdini / TouchDesigner / クリエイティブコーディングも使用。
  社内で「The Group」という隔週の実験時間を設けて技法を開発している。
  https://the-brandidentity.com/insight/how-to-meaningfully-incorporate-motion-into-branding-with-studio-dumbar-dia-and-connor-campbell
- MSI 24 について公式には「ツール」とは明言していないが、
  「fool-proof package(誰でも使える鉄壁のパッケージ)」「膨大なテンプレートとアセット」という記述から、
  **プロシージャルなマスターファイル(Cavalry 等)+ 書き出し済みアセットライブラリ + 厳格なガイドライン**
  の組み合わせで展開したとみられる。

## The Aberration の技術的な作り(推定レシピ)

映像を観察すると、以下の要素の合成:

1. **グレースケールの乱流フィールド** — FBM ノイズをドメインワープ(noise の入力座標を別の noise で歪める)
   したもの。時間で evolution。これが「有機的な流体」の正体
2. **グラデーションマップ** — 乱流フィールドの輝度に 黒→深赤→朱→白 のランプを適用(サーマル的)。
   ※ motion-lab の Thermal Flow と同じ原理
3. **エッジのスペクトラル分離(色収差)** — RGB チャンネルをわずかにずらしてサンプリングし、
   境界に青緑〜マゼンタのスペクトルが走る「Aberration(収差)」感を出す
4. **シャープな等高線の残留** — ランプに硬いストップを入れる or posterize で、
   流体の中に硬いエッジ(等高線)が生まれる
5. **テンポの3モード** — 同一シェーダーでパラメータだけ変える:
   - slow & ominous: 低速 evolution、低周波ノイズ
   - sporadic & reactive: ノイズ速度にランダムパルス/オーディオ反応
   - linear & up tempo: 一方向への UV スクロール + 高周波

After Effects なら Turbulent Displace + Gradient Map + チャンネルずらしで近似可能だが、
リアルタイム WebGL シェーダーの方が本家の作り方(プロシージャル)に近い。

## motion-lab への展開案

既存の **thermal-flow.html が既に工程 1〜2 を実装済み**。MSI 24 スタイルに寄せるには:

- [ ] 色収差(RGB シフト)パラメータの追加 — Aberration 感の核
- [ ] ハードストップ付きグラデーションランプ(等高線モード)
- [ ] テンポプリセット3種(ominous / reactive / up-tempo)を1クリック切替に
- [ ] レイヤーシステム: 流体背景の上に UI テクスチャ(Journey Data 風)+ タイポを重ねる合成モード
  → effect-stack.html との連携も検討
- [ ] 「黒＋赤」MSI 風パレットプリセット追加

## ソース一覧

- https://studiodumbar.com/work/msi-24 (公式ケーススタディ)
- https://www.behance.net/gallery/212675447/MSI-2024 (Riot 側 AD の内訳)
- https://www.oneclub.org/awards/adcn/-award/58982/msi-identity-and-motion-for-the-global-esports-phenomenon/ (ADCN 受賞ページ)
- https://www.underconsideration.com/brandnew/archives/new_logo_and_identity_for_msi_24_by_studio_dumbar_dept.php (Brand New 批評・ペイウォール)
- https://the-brandidentity.com/insight/how-to-meaningfully-incorporate-motion-into-branding-with-studio-dumbar-dia-and-connor-campbell (Dumbar のモーションワークフロー)
- https://medium.com/cavalry-animation/studio-dumbar-dept-x-demo-x-cavalry-dc785b584951 (Dumbar × Cavalry)
- https://www.creativeboom.com/resources/why-cavalry-is-the-secret-weapon-of-the-worlds-best-design-studios/ (Cavalry の生成テンプレート思想)
