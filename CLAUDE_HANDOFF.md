# CLAUDE_HANDOFF — motion-lab (AI-to-AI context dump)

Generated 2026-10-08. Dense/structured, written for a fresh Claude session to ingest fast, not for humans. All facts below were read directly from repo files (README/AGENTS/docs/git log) in two local clones — nothing inferred/guessed beyond labeled inferences.

## 0. Identity / URLs
- GitHub repo: `bats5020/motion-lab` (single repo, MIT license).
- Public URL: https://bats5020.github.io/motion-lab/ (GitHub Pages).
- Local clone #1: `/Users/maoiwai/local_work/claude project/labs/motion-lab` — on branch `codex/thermal-flow-ux-20260913`, **8 commits behind origin/main**, has uncommitted local changes (see §7).
- Local clone #2: `/Users/maoiwai/local_work/claude project/labs/motion-lab-line-flow` — **this is NOT a separate project**, it's a second git worktree/clone of the *same* `bats5020/motion-lab` remote, checked out on feature branch `codex/line-flow-20260927` (up to date with origin/main), created specifically to add the Line Flow tool without disturbing clone #1's uncommitted WIP. Decision recorded in `docs/line-flow.md`: "最新mainから専用worktreeを作り…元のMotion Lab作業ツリーに未コミットの制作作業があるため".
- Owner/maker: mao (bats5020). Role split per global CLAUDE.md: mao = visual/tone final call; Claude = UX/impl, must proactively flag concerns.

## 1. What it is
"MOTION LAB" = integrated hub of animation/graphics browser tools, all zero-build. Purpose: personal toolkit for generating motion graphics / textures / export assets for client work (LP/corporate/Shopify/WP projects) and ad-hoc visual experiments. User base = mao solo (+ AI agents editing it). Each tool does image/video processing **entirely client-side in the browser**, no server upload.

## 2. Architecture / stack
- No build step, no package.json, no bundler. Pure static HTML/CSS/JS served as-is (GitHub Pages serves `main` branch root directly — no `.github/workflows/*` found in either clone, no CNAME file, no gh-pages branch; Pages config is presumably set in repo Settings to "Deploy from branch: main / root").
- **1 tool = 1 self-contained HTML file** under `tools/*.html` (kebab-case filenames), each inlines its own `<style>`+`<script>`, mostly dependency-zero. Exceptions: Wireframe (CDN Three.js + JSZip + gif.js), Warp Type (Google Fonts), Egg Glass (vendored Three.js r0.180 + SVGLoader, see §5).
- `index.html` = the hub: a `TOOLS` JS array (name/desc/category/href/inline-SVG-thumbnail, optional `draw(svg)` callback for procedurally-generated thumbnails) rendered into cards. Adding a tool = append to this array + add file to `tools/` + add home-pill + README row. No other registration needed.
- `shared/tokens.css` = single CSS-variable token file (`--bg #0a0a0b`, `--panel #141417`, `--accent #4f5cff`, mono font stack `SF Mono/ui-monospace/Roboto Mono`). Dark UI only, shared across hub + all tools. New tools must reuse these tokens, not invent new ones.
- Every tool has a persistent "◆ MOTION LAB" pill (bottom-left) linking back to the hub.
- Stray local-only artifacts in clone #1: `.env.local` (Vercel OIDC token) + `.vercel/project.json` (projectId `prj_1cKvYISGgo78ySXSnXWE7pzsHQ3f`, project name "motion-lab"). Both are gitignored (`.vercel`, `.env*` in `.gitignore`) and absent from clone #2 — looks like an abandoned/irrelevant Vercel linkage, **not used for actual deployment** (deployment is GitHub Pages, static, no server). Safe to ignore unless user says otherwise.

## 3. Tool inventory
Categories: `raster` (bitmap/pixel/texture) and `motion` (animation).

On `origin/main` as of latest commit `ecc0097` (v1.8, 2026-09-17), 14 tools:
Halftone Lab, Effect Stack, Grid Stretch, Dither→SVG, Pixel Gradient, Thermal Flow, Glass Lab, ASCII Wave, Image Switcher, Word Switcher, Warp Type, U19 Aberration, Wireframe, Egg Glass.

Plus Line Flow = 15th tool, currently **uncommitted** on branch `codex/line-flow-20260927` (clone #2), not yet merged/PR'd to main.

| Tool | Cat | What it does |
|---|---|---|
| Halftone Lab | raster | image/procedural → halftone/dither/ASCII; melt + "lights-out" cells; anim+video record; SVG/code export. Originated from standalone repo `bats5020/halftone-lab` (still separately published), integrated here. |
| Effect Stack | raster | 14 stackable effects → generative posters; image/video source, realtime, randomize+stack-signature, WebM record |
| Grid Stretch | raster | grid-split pixel stretch w/ glitch annotation overlay |
| Dither → SVG | raster | image → halftone/dither/dot → SVG/PNG export |
| Pixel Gradient | raster | mesh-gradient base → pixelate/posterize/grain |
| Thermal Flow | raster | flagship tool: fluid-ribbon gradient/motion/keyframe graphics+video editor. See §5. |
| Glass Lab | motion | WebGL fluted-glass shader distorting a glow sphere; image/video source, presets+randomize, record, URL-shareable settings |
| ASCII Wave | motion | fluid-noise ASCII background anim, cursor interaction, code export |
| Word Switcher | motion | word/SVG switching motion graphic |
| Warp Type | motion | noise-warped text generator; presets; PNG/WebM export; Google Fonts dep |
| U19 Aberration | motion | logo/text-outline thermal glow; bg composite; loop WebM export. Name references the FENNEL U19 client project (see §6 cross-link). |
| Wireframe | motion | geometric wireframe motion graphic; CDN Three.js+JSZip+gif.js |
| Image Switcher | motion | multi-image logo-opener/slideshow; 10 transition types, intro/outro, video/PNG/ZIP-sequence/standalone-HTML/project-JSON export |
| Egg Glass | motion | 3D egg editor (pattern/logo/lighting/SVG bg), scroll-driven keyframes, PNG/video/standalone-HTML export. See §5 and §6 — ported from a FENNEL U19 client deliverable. Only tool that is a **folder**, not a single file: `tools/egg-glass/` (modular JS, vendored Three.js). |
| Line Flow (uncommitted, clone #2 only) | motion | hand-drawn stroke → refined smooth curve; multi-color gradient, grain, loop motion; exports PNG/static-SVG/standalone-HTML/WebM/project-JSON. See §5. |

## 4. Shared conventions (from both READMEs, identical)
- Naming: English, kebab-case filenames; no `-tool`/`-studio` suffixes.
- 1 tool = 1 file, zero deps, unless a library is truly required (then own subfolder, e.g. egg-glass).
- Colors must follow `shared/tokens.css` (dark UI).
- UI labels can stay Japanese; filenames/titles must be English.
- New tool workflow: branch from latest `origin/main` → add file → register in hub `TOOLS` array → add home pill → README row → PR (never push main directly, never force-push).
- Recording: WebM is default output; Glass Lab/Effect Stack/Halftone Lab fall back to MP4 depending on browser `MediaRecorder` support (extension is chosen to match actual negotiated `mimeType`, fixed in the 2026-09-05 audit, see §7).

## 5. Notable implementation mechanics (how the motion is actually built)
- **Thermal Flow** (most feature-dense tool, PC-only UI): fluid "ribbon/pool/wave" gradients via two-stage low-frequency domain warp with independent scale/rotation/center. Gradient engines: linear/radial/4-color/diamond/angle/Bezier (up to 4 paths, SVG-path import approximated to 4 editable Bezier curves). Color spaces: RGB/LinearRGB/HSV/HSL/Lab/LCH/XYZ/OKLab/OKLCH with multiple interpolation modes. Effect modules (each independently toggle-able, OFF by default on new works): Diffuse, Noise (Simplex/fBm/Voronoi/Aura-Ridges/Fractal-Drift/Curl/Domain-Warp/Seamless), Slit-scan, Stretch+glow, Normal-map relighting, Distort brushes (warp/swirl/spiky, max 1000 points), Postprocess (mirror/kaleidoscope/prism/voronoi). Full timeline: keyframes per-property, 24/30/60fps, easing graph, time-remap, ping-pong, BPM tap. Export: PNG/JPG/WebP, PNG-sequence ZIP, lossless MOV (PNG frames in QuickTime container, 512MB in-memory cap), auto-crop transparent margins on masked exports. Design brief: user asked to replicate the *feature set* of an external reference tool "KAGARIBI-15 Gradient Generator" (https://kagaribi15-grad.ke-goworks.com/) — implemented independently by observing its UI, no code/assets copied, no claim of pixel-identical output. Docs: `docs/thermal-flow-design.md`, `docs/thermal-flow-studio.md`, `docs/thermal-flow-ux.md`.
- **Line Flow**: single source-of-truth render function `createLineEngine()` shared by live UI and exported standalone HTML — guarantees identical output across preview/PNG/SVG/video. Hand-draw refine pipeline `refineStroke()`: resample to equal arc-length samples → Gaussian smoothing scaled by a "refine amount" slider → Ramer–Douglas-Peucker simplification to ≤48 anchor points (raw stroke kept, ≤1024 pts, non-destructively re-refinable). Curves: Catmull-Rom-equivalent through normalized points, color interpolated by arc length. Grain = seeded noise tile composited only inside the stroke. Motion = deterministic function of phase 0..1 (same seed+time → same frame, used for reproducible preview/PNG/SVG/video). 8 composition presets (Ribbon/Big loop/Interlace/Night drift/Soft wave/Echo lines/Color play/Color fields). Explicitly has NO text/typography feature (removed per user instruction — was in an earlier draft). Was designed against competitor UX research of fffuel llline/gggrain/ffflux, Haikei, SVGator (features only, no code reuse) — table in `docs/line-flow.md`. Validation JSON: `docs/line-flow-validation.json`.
- **Egg Glass**: only multi-file tool (`tools/egg-glass/*.js`: egg.js, lighting-controls.js, pattern-controls.js, logo-controls.js, scroll-controls.js, keyframes.js, svg-background.js, shell-material.js, transform-gizmo.js, flow-mapping.js, export-controls.js, html-export.js, webm-duration.js, style.css, index.html). WebGL2 3D egg shell renderer (Three.js r0.180 + SVGLoader vendored under `vendor/`, MIT). Scroll-%-driven keyframes for egg position/scale + background gradient/scale; PC/SP (viewport<768px, configurable) can have independently authored keyframe sets, toggle "@_" to hide/show edit chrome. Export: PNG at given scroll%, scoped-range video (MP4 where supported else WebM), self-contained standalone HTML (`html-export.js` bundles the JS modules + assets — **must update the bundling list whenever a new dependency file is added**). Transparent egg-only PNG export auto-trims to alpha bounding box at full render resolution (no scaling). Settings → localStorage, loaded images → IndexedDB, both origin-scoped (localhost settings don't carry to the Pages deployment).

## 6. Cross-link to FENNEL U19 client project (current repo context)
- Egg Glass's canon implementation was **ported from a FENNEL U19 client deliverable**: egg-glass README states "FENNEL U19案件で制作したEgg Study v21を2026-09-15に統合。元案件の `egg-study/` は移設時点の控えとして保持" — i.e. it originated as `egg-study/` inside what is presumably this FENNEL_U19ECS26 repo (the current working directory's `git status` shows an untracked `egg-study/` dir — likely the source/backup copy referenced here).
- U19 Aberration tool name also references the same U19 branding/client context.
- Asset `tools/assets/u19-kv.jpg` and `tools/egg-glass/assets/{u19-background.svg,u19-logo.png,thermal-flow-pattern.png}` are U19-branded client assets embedded in motion-lab. README/egg-glass README flag explicitly: **the MIT license on the tool code does NOT extend reuse rights to these U19-branded assets** — they're client-supplied material, keep that boundary in mind if repurposing motion-lab code elsewhere.

## 7. Dev history / timeline (from git log, oldest→newest, both clones share history up to `eafc3ef`)
1. `4797801` 2026-08-01 — v1.0, initial integrated platform launch.
2. `b879fce` 2026-08-01 — v1.1, +3 tools, Halftone Lab melt/lights-out cells.
3. `c3df91d` 2026-08-04 — v1.2, Glass Lab added + Effect Stack video support.
4. `ee34a11` 2026-08-16 — v1.3, Thermal Flow introduced (thermal gradient generator).
5. `4cbb5f0` 2026-08-18 — v1.4, Thermal Flow bonfire-asset production hardening.
6. `cfb76f3` 2026-08-19 — v1.5, +4 blue color presets.
7. `b10de73` 2026-08-19 — v1.6, +6 moodboard color presets.
8. `aab8541` 2026-09-02 — AGENTS.md added (Codex entrypoint pointing to shared `../../CLAUDE.md`).
9. `eafc3ef` 2026-09-02 — U19 Aberration + Warp Type tools added, Thermal Flow tuning, aberration research notes/shared assets. **(clone #1 HEAD stops here — it's 8 commits stale)**.
10. (2026-09-05, undated commit / `fix/recording-reliability` branch) — recording-reliability audit, see `docs/2026-09-05-tool-audit.md`: fixed MP4/WebM extension mismatch, missing cleanup on record-start failure across Glass Lab/Effect Stack/Halftone Lab/U19 Aberration; logged open TODOs (listed in §8).
11. `d1d37f0` 2026-09-15 — v1.1 (new numbering line), Egg Glass added (ported from FENNEL U19).
12. `ebefce8` 2026-09-16 — v1.2, Egg-only transparent PNG export.
13. `43612b3` 2026-09-16 — v1.3, auto-trim transparent margin on egg-only PNG.
14. `2103afa` 2026-09-16 — v1.4, PC/SP-specific keyframe editing by render width.
15. (2026-09-16, `docs/2026-09-16-motion-lab-release.md`) — consolidated unreleased work (Image Switcher new tool, recording-reliability fixes, Effect Stack seek/rewind-freeze fix) into `codex/publish-motion-lab-updates-20260916`, real-browser-verified (Playwright Chromium+WebKit, ffmpeg frame decode), merged.
16. `eb05ce1` 2026-09-16 — v1.5, Thermal Flow production features + transparent/high-res export.
17. `b79f09a` 2026-09-16 — v1.6, Image Switcher + recording stability published.
18. `0158c4a` 2026-09-17 — v1.7, Thermal Flow standalone-HTML export added.
19. `ecc0097` 2026-09-17 — v1.8 (current `origin/main` HEAD), preserve motion+production settings across look switches.
20. 2026-09-27 (uncommitted, clone #2, branch `codex/line-flow-20260927`) — Line Flow tool added, not yet merged.

**Important gotcha for next session**: clone #1 (`.../labs/motion-lab`) is on stale branch `codex/thermal-flow-ux-20260913` (8 commits behind) AND has uncommitted modifications (`README.md`, `docs/thermal-flow-design.md`, `tools/{effect-stack,glass-lab,halftone-lab,thermal-flow,u19-aberration}.html`) plus untracked `docs/2026-09-05-tool-audit.md`, `docs/thermal-flow-studio.md`, `docs/thermal-flow-ux.md`, `docs/ticket-web-references.md`, `tests/`. These correspond to the `fix/recording-reliability` work dated 2026-09-05. That same fix content appears to have **already been integrated into origin/main** via the 2026-09-16 release (`docs/2026-09-16-motion-lab-release.md` explicitly lists the same recording fixes as merged). **Before touching clone #1, diff its uncommitted changes against origin/main to confirm whether they're now-redundant duplicates (safe to discard) or contain anything not yet upstream (must be preserved/rebased) — do not assume either way without checking.**

## 8. Known open items / TODOs (from `docs/2026-09-05-tool-audit.md`, unconfirmed as to current status — re-check against latest main before acting)
- High: harden remaining tools' recording cleanup (Thermal Flow/Word Switcher/Wireframe/ASCII Wave/Warp Type).
- High: unify settings+asset save/restore (currently fragmented: U19 uses URL+localStorage separately, Effect Stack JSON excludes images — cross-device reproducibility not guaranteed).
- High: validate loaded JSON/URL values (U19's `loadHash → deepAssign` does broad unchecked assignment — no allowlist/range/type validation against malformed/hostile input).
- Med: suppress redundant per-frame redraw/UV-update when paused (Warp Type, Glass Lab, U19 always redraw even when static); offer lower-res "working" quality mode.
- Med: measure/fix loop-export time precision (U19 clamps dt to 0.1s but stop is wall-clock based → may undershoot one period at low FPS; Wireframe render-time+setTimeout may overshoot).
- Med: add undo/redo + before/after compare + named-preset save to more tools (Thermal Flow already has Undo as reference impl).
- Med: keyboard/narrow-viewport accessibility pass (some slider+input pairs lack label association/focus visibility; needs real-browser check).
- Low: hub search/filter by output format (12+ tools makes Raster/Motion categories insufficient).
- Testing gap noted repeatedly: `node --test tests/recording.test.cjs` covers lifecycle logic via mocked browser APIs only; real GPU rendering / actual encode-success / FPS are NOT covered by that suite — separate Playwright/Puppeteer browser tests exist per-tool (`tests/*.browser.cjs`, `tests/*.browser.mjs`) and were the ones run for release sign-off, with evidence artifacts dumped to `/tmp/<feature>-qa/` or `/private/tmp/motion-lab-updates-qa/` (report.json + screenshots/downloads), not committed to repo.

## 9. Key file map (clone #2, most complete tree)
```
index.html                 hub (TOOLS array + card renderer)
shared/tokens.css          design tokens (only shared CSS)
AGENTS.md                  Codex/AI entrypoint → points to ../../CLAUDE.md (mao's global working-style doc)
README.md                  SSOT for tool list, conventions, status
docs/
  2026-09-05-tool-audit.md         recording-reliability audit + open TODOs
  2026-09-15-egg-glass-release.md  Egg Glass integration record
  2026-09-16-egg-responsive-motion.md
  2026-09-16-egg-transparent-png.md
  2026-09-16-motion-lab-release.md release/verification record (unreleased-work consolidation)
  image-switcher.md                Image Switcher design/usage/verification
  line-flow.md                     Line Flow design/usage/verification/decision-log (uncommitted feature)
  line-flow-validation.json        persisted validation summary for Line Flow
  msi24-aberration-research.md
  shader-tool-research.md
  thermal-flow-design.md / -studio.md / -ux.md   Thermal Flow design+feature+UX records
tools/*.html                one file per tool (14 of 15; Egg Glass is the exception)
tools/egg-glass/            Egg Glass module tree + README.md (own SSOT note) + vendor/ (Three.js r0.180, SVGLoader, MIT LICENSE)
tools/assets/u19-kv.jpg     U19 client asset used by tools
tests/*.test.cjs            Node built-in test runner, no extra deps (`node --test ...`)
tests/*.browser.cjs/.mjs    Playwright/Puppeteer real-browser verification scripts (not run in CI, run manually pre-release)
```

## 10. If asked to make changes
- Follow global `/Users/maoiwai/local_work/claude project/CLAUDE.md` (no rigid design rules, but hard bans: no direct push/force-push to main, always branch from latest origin/main, no committing other-site code/assets, no editing build output, don't invent new design tokens where one exists).
- This repo's own stated workflow (README "ツールを追加する" + "運用ルール" sections, identical in both clones) takes precedence for motion-lab-specific conventions (file-per-tool, kebab-case, tokens.css reuse, PR-based merge to main triggering GitHub Pages auto-deploy).
- Any new tool needs: real-browser verification evidence (not just the Node mock test) before claiming done, per the project's established pattern (`docs/*-release.md`, `docs/*.browser.{cjs,mjs}`).
