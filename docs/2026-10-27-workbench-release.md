# Workbench UI and editing/export consistency

## Scope

- Organize19 tools into five purpose-based categories and21 workspaces. Heatmap and Halftone have purpose-specific entrances; original URLs and shared settings remain valid.
- Apply a compact dark editor shell with responsive navigation, canvas and inspector layout. Keep Thermal Flow's viewport stable when inspector sections expand.
- Add direct numeric entry, field-step arrow keys, Shift×10 nudging and grouped Cmd/Ctrl Undo/Redo without taking over ordinary text/IME undo.
- Unify export setup order: size, format, transparency, FPS, then tool-specific settings. Keep native renderers/encoders and explain unsupported combinations.

## QA corrections

- Wireframe releases export locks/restores playback after renderer/encoder/disposal failures.
- Pixel, Dither and Grid export dimensions follow Undo/Redo while their dialog stays open.
- Wireframe FPS remains single-selected, and native panel rebuilds keep unique current modal controls and focus.
- Egg's moved FPS/alpha/viewport controls remain in history; asset-load guards and format consistency are preserved.
- Dither blocks stale outputs during debounce/queued rendering and recovers safely from failed conversion.
- Flame/HUD serialize export preparation and clean up cancellation/failure paths.
- Image Switcher prunes decoded images outside current state, both history stacks and active imports/gestures.

## Verification

`node --test tests/*.test.cjs`:401 passed,0failed. This includes55 regressions added for the seven corrections. `git diff --check` passes. Baseline-preservation checks cover the original engine bodies outside explicit bounded edits.

Actual Chrome checks verified Pixel/Grid/Dither Undo/Redo dimensions against decoded PNG/JPEG output; transparent Dither SVG/PNG; Image deletion Undo/Redo followed by PNG export; HUD cancellation and successful retry producing H.2641920×1080,30fps,233frames. Affected editors' dialogs fit320px and390px viewports. Catalog search, composed filters and Back/Forward, shared-hash restoration, representative focus/keyboard flows, and prior representative SVG/HTML/WebM downloads were also checked.

## Verification limits

The test browser did not provide WebGL. GPU rendering/encoding and Egg standalone runtime require a GPU-capable browser review; deterministic failure/history tests do not establish their visual output. Safari/iOS touch behavior was not executed. Not every asset, format, codec or long-duration memory branch was exported.

New image loads remain explicit history boundaries in tools that cannot safely retain previous source data. Format controls do not invent unsupported transparency/FPS combinations; some original encoding stages do not support immediate cancellation. Original CDN-dependent tools retain those network dependencies.
