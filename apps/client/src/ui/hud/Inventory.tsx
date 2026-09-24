import { memo } from "react";
import { GRENADES, MatchPhase, WEAPONS, type WeaponId } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P4): the bottom-right corner — the grenade slots (zone `gear`) and the
 * weapon with its ammunition (zone `inv`; the weapon name lives inside that plate until P4 gives it
 * its own `weapon` zone, because zones never nest), moved out of `Hud.tsx` verbatim
 * (docs/UI_U_SPEC.md §7 P0 0d, §4.2).
 */
export const Inventory = memo(function Inventory(_props: ZoneProps) {
  const connected = useHudSlice((s) => s.connected);
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const lethal = useHudSlice((s) => s.lethal);
  const lethalCount = useHudSlice((s) => s.lethalCount);
  const tactical = useHudSlice((s) => s.tactical);
  const tacticalCount = useHudSlice((s) => s.tacticalCount);
  const cookingKind = useHudSlice((s) => s.cookingKind);
  const weapon = useHudSlice((s) => s.weapon);
  const ammo = useHudSlice((s) => s.ammo);
  const reserve = useHudSlice((s) => s.reserve);
  const reloading = useHudSlice((s) => s.reloading);
  const w = WEAPONS[weapon as WeaponId];
  const reloadMs = w.reloadMs;
  return (
    <>
      {/* Bottom-right: weapon + ammo, grenade slots above */}
      {connected && !ended && (
        <div className="gear" data-zone="gear" data-testid="gear">
          <div className={`gear-slot ${lethal ? "" : "empty"} ${cookingKind && GRENADES[cookingKind].slot === "lethal" ? "cooking" : ""}`} data-testid="slot-lethal">
            <span className="key">G</span><span>{lethal ? GRENADES[lethal].name.toUpperCase() : "BOJOWY"}</span><span className="count">{lethal ? lethalCount : "–"}</span>
          </div>
          <div className={`gear-slot ${tactical ? "" : "empty"}`} data-testid="slot-tactical">
            <span className="key">4</span><span>{tactical ? GRENADES[tactical].name.toUpperCase() : "TAKTYCZNY"}</span><span className="count">{tactical ? tacticalCount : "–"}</span>
          </div>
        </div>
      )}
      {!ended && <div className="ammo" data-zone="inv" data-testid="ammo">
        <div className="weapon-name">{w.name}<span className="slot">{w.slot}</span></div>
        <div className={`ammo-num ${ammo === 0 && w.kind !== "melee" ? "empty" : ""}`}>{w.kind === "melee" ? <span className="mag">∞</span> : reloading ? <span className="reloading">PRZEŁADOWANIE</span> : <><span className="mag">{ammo}</span><span className="sep">/</span><span className="res">{reserve}</span></>}</div>
        {reloading && <div className="reload-bar"><div className="reload-fill" key={weapon + String(reloading)} style={{ animationDuration: `${reloadMs}ms` }} /></div>}
      </div>}
    </>
  );
});
