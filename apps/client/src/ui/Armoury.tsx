import { ARMOR, ARMOR_ORDER, GRENADES, GRENADE_ORDER, MASTERY_TIERS, PERKS, PERK_ORDER, PRIMARY_ORDER, SECONDARY_ORDER, WEAPONS, WEAPON_PRICES, masteryFor, type WeaponId, type WeaponKills } from "@frankibarber/shared";
import { ArmorArt, GrenadeArt, PerkArt, WeaponArt } from "./art/GearArt";
import { GRENADE_BLURB, WEAPON_BLURB, WEAPON_ROLE } from "./gearText";

const money = (n: number) => (n === 0 ? "FREE" : `$${n.toLocaleString("en-US")}`);

/** Stat bars are relative to the roster's extremes, so the bar says "how this compares", not a number nobody can place. */
const MAXES = (() => {
  const all = Object.values(WEAPONS).filter((w) => w.kind !== "melee");
  return {
    damage: Math.max(...all.map((w) => w.damage * w.pellets)),
    rpm: Math.max(...all.map((w) => w.rpm)),
    range: Math.max(...all.map((w) => w.rangeMax)),
    magazine: Math.max(...all.map((w) => w.magazine)),
  };
})();

function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = Math.max(2, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="stat-bar" title={`${label}: ${text}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-track"><span className="stat-fill" style={{ width: `${pct}%` }} /></span>
      <span className="stat-text">{text}</span>
    </div>
  );
}

/** The mastery strip on a card: tier, lifetime kills, progress to the next tier. */
export function MasteryStrip({ kills }: { kills: number }) {
  const m = masteryFor(kills);
  const pct = m.maxed ? 100 : Math.round((m.into / Math.max(1, m.need)) * 100);
  return (
    <div className={`mastery tier-${m.tier}`} data-testid="mastery">
      <span className="mastery-tier">{m.tier === 0 ? "NO RANK" : m.name}</span>
      <span className="mastery-track"><span className="mastery-fill" style={{ width: `${pct}%` }} /></span>
      <span className="mastery-text">{m.maxed ? `${m.kills} KILLS · MAX` : `${m.kills} / ${MASTERY_TIERS[m.tier + 1].kills} KILLS`}</span>
    </div>
  );
}

function WeaponCard({ id, kills }: { id: WeaponId; kills: number }) {
  const w = WEAPONS[id];
  const melee = w.kind === "melee";
  const launcher = w.kind === "launcher";
  return (
    <article className="arm-card" data-testid={`arm-${id}`}>
      <div className="arm-art"><WeaponArt id={id} /></div>
      <div className="arm-head">
        <div>
          <div className="arm-name">{w.name}</div>
          <div className="arm-role">{WEAPON_ROLE[id]} · SLOT {w.slot}{w.scoped ? " · SCOPE" : ""}{w.automatic ? " · AUTO" : ""}</div>
        </div>
        <div className="arm-price">{money(WEAPON_PRICES[id])}</div>
      </div>
      <p className="arm-blurb">{WEAPON_BLURB[id]}</p>
      {!melee && (
        <div className="arm-stats">
          <Bar label="DMG" value={launcher ? GRENADES.shell.damage : w.damage * w.pellets} max={MAXES.damage} text={launcher ? `${GRENADES.shell.damage} blast` : w.pellets > 1 ? `${w.damage}×${w.pellets}` : `${w.damage}`} />
          <Bar label="RPM" value={w.rpm} max={MAXES.rpm} text={`${w.rpm}`} />
          <Bar label="RANGE" value={launcher ? 40 : w.rangeMax} max={MAXES.range} text={launcher ? "arc" : `${w.range}–${w.rangeMax} m`} />
          <Bar label="MAG" value={w.magazine} max={MAXES.magazine} text={`${w.magazine} + ${w.reserve}`} />
          <Bar label="SPEED" value={(w.mobility - 0.85) * 100} max={20} text={`${Math.round(w.mobility * 100)}%`} />
        </div>
      )}
      <MasteryStrip kills={kills} />
    </article>
  );
}

/**
 * The armoury (2.1): every weapon and every shop item, drawn, with numbers and the player's
 * mastery on each. Read at leisure from the menu, where the buy menu's fifteen seconds are not
 * ticking; the point is that a new player walks into their first match already knowing what the
 * S12 is for.
 */
export function Armoury({ weapons }: { weapons: WeaponKills }) {
  return (
    <div className="armoury" data-testid="armoury">
      <h3>PRIMARY <span className="shop-hint">slot 1 · one at a time · buy in the first 15 s after a spawn or at a $ counter</span></h3>
      <div className="arm-grid">{PRIMARY_ORDER.map((id) => <WeaponCard key={id} id={id} kills={weapons[id] ?? 0} />)}</div>
      <h3>SIDEARM <span className="shop-hint">slot 2 · the P9 is free and always with you</span></h3>
      <div className="arm-grid">{SECONDARY_ORDER.map((id) => <WeaponCard key={id} id={id} kills={weapons[id] ?? 0} />)}</div>
      <h3>MELEE <span className="shop-hint">slot 3 · V</span></h3>
      <div className="arm-grid"><WeaponCard id="clippers" kills={weapons.clippers ?? 0} /></div>

      <h3>GRENADES <span className="shop-hint">lethal (G) and tactical (4) · two of a kind</span></h3>
      <div className="arm-grid small">
        {GRENADE_ORDER.map((id) => {
          const g = GRENADES[id];
          return (
            <article className="arm-card" key={id} data-testid={`arm-${id}`}>
              <div className="arm-art sq"><GrenadeArt id={id} /></div>
              <div className="arm-head"><div><div className="arm-name">{g.name}</div><div className="arm-role">{g.slot.toUpperCase()} · {g.slot === "lethal" ? "G" : "4"}</div></div><div className="arm-price">{money(g.price)}</div></div>
              <p className="arm-blurb">{GRENADE_BLURB[id]}</p>
              {(id === "frag" || id === "molotov" || id === "knife") && <MasteryStrip kills={weapons[id] ?? 0} />}
            </article>
          );
        })}
      </div>

      <h3>BARBER PERKS <span className="shop-hint">consumed on purchase · one of each at a time</span></h3>
      <div className="arm-grid small">
        {PERK_ORDER.map((id) => {
          const p = PERKS[id];
          return (
            <article className="arm-card" key={id} data-testid={`arm-${id}`}>
              <div className="arm-art sq"><PerkArt id={id} /></div>
              <div className="arm-head"><div><div className="arm-name">{p.name}</div><div className="arm-role">{p.durationMs > 0 ? `${p.durationMs / 1000} S` : "NEXT SPAWN"}</div></div><div className="arm-price">{money(p.price)}</div></div>
              <p className="arm-blurb">{p.blurb}</p>
            </article>
          );
        })}
      </div>

      <h3>ARMOUR <span className="shop-hint">absorbs half of every hit until the plate is gone · lost on death</span></h3>
      <div className="arm-grid small">
        {ARMOR_ORDER.map((id) => {
          const a = ARMOR[id];
          return (
            <article className="arm-card" key={id} data-testid={`arm-${id}`}>
              <div className="arm-art sq"><ArmorArt id={id} /></div>
              <div className="arm-head"><div><div className="arm-name">{a.name}</div><div className="arm-role">PLATE {a.armor}</div></div><div className="arm-price">{money(a.price)}</div></div>
              <p className="arm-blurb">{a.blurb}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
