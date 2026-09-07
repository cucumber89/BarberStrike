# Graphics quality and live rendering

## Fixed regression

Frozen Babylon PBR materials reused a shader compiled for HDR post-processing when
switching to material-side grading on LOW / MEDIUM. The display then received linear
colour without its intended conversion. In the fixed-camera interior probe, HIGH ->
LOW previously changed mean luminance from 21.73 to 1.90 (8-bit screen values).

The post-processing controller now invalidates material readiness when grading changes.
It retains frozen materials for normal frames. Exposure is 1.25 times the independent
brightness setting on all presets. Vignetting no longer changes visibility by quality.
The same probe after the fix measured 22.52 on HIGH and 22.45 on LOW.

## Controls

- Brightness 75–150%, preserved across preset changes.
- FXAA independent of post-processing; native canvas AA disabled to avoid double AA and
  ensure OFF actually removes smoothing.
- LOW: no post passes by default. MEDIUM: FXAA. HIGH: quarter-resolution bloom + FXAA.
  ULTRA also adds restrained sharpening. HDR targets are used only for bloom.
- Shadows OFF / 1024 / 2048 apply live without rebuilding the map. Their static shadow
  map renders once per quality change; dynamic character shadows remain outside this pass.
- Dynamic resolution targets 60 / 90 / 120 FPS, up to the user's render scale. This is
  a target, not a frame limiter or guarantee. Select a target the display can support.
- Resolution no longer resets on unrelated settings. The controller can reduce again
  if an initial reduction is insufficient and can recover at a vsynced 60 FPS.
- Renderer and imported scenery still apply on the next match; the UI states this.
- Stored graphics settings are validated and migrated, including old saves.

Changing audio, controls or HUD no longer rebuilds the post-processing pipeline.
Brightness updates reuse the pipeline. Effect topology is built once per relevant change.
Partially initialized WebGPU engines are disposed before WebGL2 fallback.

## Reproduce

Run the client dev server, then open `/graphics-review.html`. This isolated map probe
uses the real postfx module but no players or network. From the repository root:

```powershell
$env:SHOT_DIR='C:/temporary/graphics-review'
$env:ASSERT_GRAPHICS='1'
node apps/client/e2e/tools/graphics-review.mjs
```

Local Chrome is required. The script uses SwiftShader, waits for shader readiness,
captures seven configurations, compares screen luminance, checks FXAA, cycles presets,
changes shadows, and verifies material/texture counts return to baseline. CPU software
rendering validates correctness, not real GPU FPS or WebGPU-driver compatibility.

Unit regressions cover invalid settings, calibration preservation, frozen-material
invalidation, pipeline reuse, resolution reset behavior and recovery.
