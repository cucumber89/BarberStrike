# Night district — art pass

The perimeter is rebuilt as individual masonry buildings with roof-height variation,
slender windows, stone sills, gutters and drainpipes. Existing sealed map segments
anchor the additions; lane portals remain clear. Upper masses are background dressing,
not playable floors. The shop receives parapet caps, brick piers and brass sign trim.

Materials use muted paint, smaller bricks and restrained normal strength. Foliage uses
a dedicated procedural leaf surface and irregular crowns; car cabins taper towards
the roof. These are procedural assets without external downloads or new lights.

Static props now merge in 16 m zones. Structural batching remains unchanged. This
reduces draw calls but can slightly change which practical lights affect small props.
The map still has 45 lights; this pass does not claim to solve all existing GPU costs.

## Reproduce the visual check

Run `pnpm --filter @frankibarber/client dev`, then open
`http://localhost:5174/map-review.html`. This development-only entry renders the map
without networking, HUD, characters or optional imported prop models. It is not an
additional production Vite entry. Drag to look around; the camera has no collision.

With local Chrome installed, set `SHOT_DIR` to an output directory and run
`node apps/client/e2e/tools/map-review.mjs` from the repository root. The tool captures
six fixed 1440 × 900 views and writes `metrics.json`. Draw calls are the counter delta
of one explicit scene render after the static shadow map has settled. Rendering uses
SwiftShader, so these measurements compare geometry and calls, not hardware FPS.

Validation: workspace tests, TypeScript check, production build and six-view browser
review. See the delivered comparison for measured before/after counts.
