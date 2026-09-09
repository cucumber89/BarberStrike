// Development-only evidence entry point, deliberately outside the game's production entry graph.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BODY_ENVELOPE, BUILDS, HAIRCUTS, OUTFITS, PLAYER, buildRig, envelopeOf, frontalArea, outfitParts } from "@frankibarber/shared";
import { Engine } from "@babylonjs/core/Engines/engine";
import { CharacterPreview } from "../../src/ui/CharacterPreview";

/**
 * The six builds side by side, with the numbers under each one.
 *
 * Two jobs. It is the SCREENSHOT: six silhouettes in one frame is the only way to judge whether
 * they are really six, and a reviewer should be able to read the claim ("same crown, same width,
 * same head zone") off the same image that shows the difference. And it is the LEAK PROOF, the way
 * `skin-review.tsx` is for weapons — mount and unmount the whole grid and count the engines.
 */
function diagnostics() {
  return {
    engines: Engine.Instances.length,
    scenes: Engine.Instances.flatMap((e) => e.scenes).map((s) => ({ meshes: s.meshes.length, materials: s.materials.length })),
    builds: BUILDS.map((b) => {
      const rig = buildRig(b), envelope = envelopeOf(rig);
      return {
        id: b.id, name: b.name,
        crownY: envelope.crownY, footY: envelope.footY, halfW: envelope.halfW,
        headBottomY: envelope.headBottomY, headZoneStart: PLAYER.height * (1 - PLAYER.headFraction),
        hipY: rig.hipY, waistW: rig.vestW, chestW: rig.chestW, sleeveW: rig.upperW,
        neckGap: rig.neckH, skullH: rig.skullH, headZ: rig.headZ,
        frontalArea: frontalArea(rig),
      };
    }),
    outfits: OUTFITS.map((o) => ({
      id: o.id, name: o.name, rarity: o.rarity,
      headgear: o.headgear, face: o.face, back: o.back, neck: o.neck, stripes: o.stripes, apron: o.apron,
      pieces: outfitParts(o, buildRig(BUILDS[0])).length,
      // The reserved role, read off the catalog: an outfit that could name it would show up here.
      paints: Object.keys(o.palette ?? {}).sort(),
    })),
    hitbox: { halfWidth: PLAYER.halfWidth, height: PLAYER.height, eyeHeight: PLAYER.eyeHeight, headFraction: PLAYER.headFraction },
  };
}

function Review() {
  const [haircut, setHaircut] = useState("cap");
  const [mounted, mount] = useState(true);
  // One grid at a time: every tile owns a WebGL context, and nineteen of them at once is more than
  // a browser hands out.
  const [mode, setMode] = useState<"builds" | "outfits">("builds");
  const [build, setBuild] = useState(BUILDS[0].id);
  const [outfit, setOutfit] = useState(OUTFITS[0].id);
  // A cape and a backpack live on the back, so the evidence needs a view from it.
  const [back, setBack] = useState(false);
  const rigs = BUILDS.map((b) => ({ b, rig: buildRig(b) }));
  const builds = mode === "builds";
  return (
    <main data-testid="body-review" data-mode={mode}>
      <header>
        <span>BARBERSTRIKE / POSTAĆ</span>
        <h1>{builds ? "Sześć budów, jeden hitbox." : "Trzynaście strojów, jeden hitbox."}</h1>
        <p>
          Kapsuła kolizji {PLAYER.halfWidth * 2} × {PLAYER.height} m, oczy {PLAYER.eyeHeight} m, głowa to górne{" "}
          {Math.round(PLAYER.headFraction * 100)}% ciała — identycznie dla każdej budowy i każdego stroju.
          Czubek głowy {BODY_ENVELOPE.crownY} m i najszerszy punkt {BODY_ENVELOPE.halfW} m są wspólne.
          Barwa drużyny (pierś, plecy, opaska) nie należy do stroju i nie da się jej przemalować.
        </p>
      </header>
      <nav>
        <button data-testid="mode-builds" aria-pressed={builds} onClick={() => setMode("builds")}>SYLWETKI</button>
        <button data-testid="mode-outfits" aria-pressed={!builds} onClick={() => setMode("outfits")}>STROJE</button>
        <button data-testid="toggle-back" aria-pressed={back} onClick={() => setBack(!back)}>{back ? "OD PRZODU" : "OD TYŁU"}</button>
        <span className="sep" />
        {builds
          ? OUTFITS.map((o) => (
              <button data-testid={`fit-${o.id}`} aria-pressed={o.id === outfit} key={o.id} onClick={() => setOutfit(o.id)}>{o.name}</button>
            ))
          : BUILDS.map((b) => (
              <button data-testid={`on-${b.id}`} aria-pressed={b.id === build} key={b.id} onClick={() => setBuild(b.id)}>{b.name}</button>
            ))}
      </nav>
      <nav>
        {HAIRCUTS.map((h) => (
          <button data-testid={`cut-${h.id}`} aria-pressed={h.id === haircut} key={h.id} onClick={() => setHaircut(h.id)}>{h.name}</button>
        ))}
      </nav>
      {builds ? (
        <div className="grid six" data-testid="body-grid">
          {rigs.map(({ b, rig }) => (
            <figure key={b.id} data-testid={`body-${b.id}`}>
              <div className="stage">{mounted && <CharacterPreview build={b.id} haircut={haircut} outfit={outfit} rotate={false} turn={back ? Math.PI : 0} />}</div>
              <figcaption>
                <b>{b.name}</b>
                <small>{b.blurb}</small>
                <dl>
                  <div><dt>biodro</dt><dd>{rig.hipY.toFixed(3)} m</dd></div>
                  <div><dt>pas</dt><dd>{rig.vestW.toFixed(3)} m</dd></div>
                  <div><dt>klata</dt><dd>{rig.chestW.toFixed(3)} m</dd></div>
                  <div><dt>rękaw</dt><dd>{rig.upperW.toFixed(3)} m</dd></div>
                  <div><dt>szyja</dt><dd>{rig.neckH.toFixed(3)} m</dd></div>
                  <div><dt>głowa</dt><dd>{rig.skullH.toFixed(3)} m</dd></div>
                </dl>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="grid seven" data-testid="outfit-grid">
          {OUTFITS.map((o) => (
            <figure key={o.id} data-testid={`outfit-${o.id}`} className={o.rarity}>
              <div className="stage">{mounted && <CharacterPreview build={build} haircut={haircut} outfit={o.id} rotate={false} turn={back ? Math.PI : 0} />}</div>
              <figcaption>
                <b>{o.name}</b>
                <small>{o.blurb}</small>
                <dl>
                  <div><dt>klasa</dt><dd>{o.rarity}</dd></div>
                  <div><dt>nakrycie</dt><dd>{o.headgear}</dd></div>
                  <div><dt>twarz</dt><dd>{o.face}</dd></div>
                  <div><dt>plecy</dt><dd>{o.back}</dd></div>
                  <div><dt>szyja</dt><dd>{o.neck}</dd></div>
                  <div><dt>paski</dt><dd>{o.stripes}</dd></div>
                </dl>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <footer>
        <button data-testid="toggle-preview" onClick={() => mount(!mounted)}>{mounted ? "Zamknij podgląd" : "Otwórz podgląd"}</button>
        <span>Różni się rozkład masy i kolor, nie rozmiar celu. Trafienia liczy serwer z `PLAYER` i nic tu tego nie dotyka.</span>
      </footer>
    </main>
  );
}

/**
 * Handed to the harness on `window` rather than exported for it to `import()`.
 *
 * A dynamic import of THIS module from the test re-ran the entry code and called `createRoot` on a
 * container that already had one, so a second tree of six previews mounted behind the first and the
 * leak check counted twelve engines where it expected zero. The diagnostics have to be reachable
 * without executing the page again.
 */
(window as unknown as { __bodyReview: { diagnostics: typeof diagnostics } }).__bodyReview = { diagnostics };

const style = document.createElement("style");
style.textContent = `*{box-sizing:border-box}body{margin:0;background:#0d1318;color:#f0e7d9;font:15px system-ui}main{max-width:1720px;margin:auto;padding:28px}header span{letter-spacing:4px;color:#cfa666;font-size:12px}h1{font-size:42px;margin:12px 0 4px}p{color:#98a7b3;max-width:1100px;line-height:1.5}nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}button{background:#18222b;color:#d4dce2;border:1px solid #35424d;padding:10px 14px;cursor:pointer;font:inherit}button[aria-pressed=true]{border-color:#cfa666;background:#302c26;color:#f5d6a2}.grid{display:grid;gap:10px;margin:18px 0}.grid.six{grid-template-columns:repeat(6,1fr)}.grid.seven{grid-template-columns:repeat(7,1fr)}.grid.seven .stage{height:340px}.grid.seven small{min-height:56px;font-size:11px}nav .sep{width:1px;background:#35424d;margin:0 4px}figure.zloty{border-color:#ffc52f}figure.legendarny{border-color:#ef4d93}figure.epicki{border-color:#a34fff}figure.rzadki{border-color:#5979ff}figure{margin:0;border:1px solid #35424d;background:#111820}.stage{height:520px;border-bottom:1px solid #35424d}figcaption{padding:12px}b{display:block;font-size:19px;letter-spacing:.06em}small{display:block;color:#9fadb8;font-size:12px;margin-top:6px;min-height:48px;line-height:1.4}dl{margin:8px 0 0;display:grid;gap:2px}dl>div{display:flex;justify-content:space-between;font:11px ui-monospace,monospace;color:#8ea0ad}dd{margin:0;color:#d8c69c}footer{display:flex;align-items:center;gap:20px;margin-top:20px;color:#91a0ad;font-size:12px}`;
document.head.appendChild(style);
createRoot(document.getElementById("review")!).render(<Review />);
