// Development-only evidence entry point, deliberately outside the game's production entry graph.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BODY_ENVELOPE, BUILDS, HAIRCUTS, PLAYER, buildRig, envelopeOf, frontalArea } from "@frankibarber/shared";
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
    hitbox: { halfWidth: PLAYER.halfWidth, height: PLAYER.height, eyeHeight: PLAYER.eyeHeight, headFraction: PLAYER.headFraction },
  };
}

function Review() {
  const [haircut, setHaircut] = useState("cap");
  const [mounted, mount] = useState(true);
  const rigs = BUILDS.map((b) => ({ b, rig: buildRig(b) }));
  return (
    <main data-testid="body-review">
      <header>
        <span>BARBERSTRIKE / SYLWETKI</span>
        <h1>Sześć budów, jeden hitbox.</h1>
        <p>
          Kapsuła kolizji {PLAYER.halfWidth * 2} × {PLAYER.height} m, oczy {PLAYER.eyeHeight} m, głowa to górne{" "}
          {Math.round(PLAYER.headFraction * 100)}% ciała — identycznie dla każdej budowy.
          Czubek głowy {BODY_ENVELOPE.crownY} m i najszerszy punkt {BODY_ENVELOPE.halfW} m są wspólne.
        </p>
      </header>
      <nav>
        {HAIRCUTS.map((h) => (
          <button data-testid={`cut-${h.id}`} aria-pressed={h.id === haircut} key={h.id} onClick={() => setHaircut(h.id)}>{h.name}</button>
        ))}
      </nav>
      <div className="grid" data-testid="body-grid">
        {rigs.map(({ b, rig }) => (
          <figure key={b.id} data-testid={`body-${b.id}`}>
            <div className="stage">{mounted && <CharacterPreview build={b.id} haircut={haircut} rotate={false} />}</div>
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
      <footer>
        <button data-testid="toggle-preview" onClick={() => mount(!mounted)}>{mounted ? "Zamknij podgląd" : "Otwórz podgląd"}</button>
        <span>Różni się rozkład masy, nie rozmiar celu. Trafienia liczy serwer z `PLAYER` i nic tu tego nie dotyka.</span>
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
style.textContent = `*{box-sizing:border-box}body{margin:0;background:#0d1318;color:#f0e7d9;font:15px system-ui}main{max-width:1720px;margin:auto;padding:28px}header span{letter-spacing:4px;color:#cfa666;font-size:12px}h1{font-size:42px;margin:12px 0 4px}p{color:#98a7b3;max-width:1100px;line-height:1.5}nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}button{background:#18222b;color:#d4dce2;border:1px solid #35424d;padding:10px 14px;cursor:pointer;font:inherit}button[aria-pressed=true]{border-color:#cfa666;background:#302c26;color:#f5d6a2}.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:18px 0}figure{margin:0;border:1px solid #35424d;background:#111820}.stage{height:520px;border-bottom:1px solid #35424d}figcaption{padding:12px}b{display:block;font-size:19px;letter-spacing:.06em}small{display:block;color:#9fadb8;font-size:12px;margin-top:6px;min-height:48px;line-height:1.4}dl{margin:8px 0 0;display:grid;gap:2px}dl>div{display:flex;justify-content:space-between;font:11px ui-monospace,monospace;color:#8ea0ad}dd{margin:0;color:#d8c69c}footer{display:flex;align-items:center;gap:20px;margin-top:20px;color:#91a0ad;font-size:12px}`;
document.head.appendChild(style);
createRoot(document.getElementById("review")!).render(<Review />);
