import type { ReactElement } from "react";
import type { GameMode } from "@frankibarber/shared";

/**
 * Menu icons (2.6). The lobby had no icon system at all: every mode was three capital letters in a
 * box, which is a label, not a picture — a player scanning six of them read six identical boxes.
 *
 * They are inline SVG rather than an icon font or files for the same reason the rest of the art is
 * procedural: no download, no manifest entry, no licence row. Every glyph is one 24×24 viewBox,
 * stroked in `currentColor`, so the card's own state (idle / hover / selected) colours the icon for
 * free and nothing here has to know about the palette.
 */

const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Two sides walking into each other. */
const Tdm = (): ReactElement => (
  <svg {...stroke}>
    <path d="M3 7h6l3 5-3 5H3" />
    <path d="M21 7h-6l-3 5 3 5h6" />
  </svg>
);

/** Five roles: a squad line-up. */
const Boys = (): ReactElement => (
  <svg {...stroke}>
    <circle cx="8" cy="8.5" r="2.6" />
    <path d="M3.5 18c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2" />
    <circle cx="16.5" cy="9.5" r="2" />
    <path d="M13.5 18c0-2.2 1.5-3.5 3-3.5s3.5 1.3 3.5 3.5" />
  </svg>
);

/** Three flags on a line — A, B, C. */
const Dom = (): ReactElement => (
  <svg {...stroke}>
    <path d="M5 20V5l5 2-5 2" />
    <path d="M12 20v-9l4 1.6L12 14" />
    <path d="M19 20v-6" />
    <path d="M3 20h18" />
  </svg>
);

/** The charge and its fuse. */
const Bomb = (): ReactElement => (
  <svg {...stroke}>
    <circle cx="10.5" cy="14.5" r="5.5" />
    <path d="M14.5 10.5 17 8M17 8h3M17 8V5" />
  </svg>
);

/** The ladder: every kill hands you the next gun. */
const GunGame = (): ReactElement => (
  <svg {...stroke}>
    <path d="M4 20h4v-4H4zM10 20h4v-8h-4zM16 20h4v-12h-4z" />
    <path d="M17 4.5h3.5V8" />
  </svg>
);

/** The clippers, teeth first — the mode is what they do to you. */
const Ostrzyzeni = (): ReactElement => (
  <svg {...stroke}>
    <rect x="6" y="9" width="12" height="8" rx="1.5" />
    <path d="M6 9V7h12v2" />
    <path d="M8 17v2M11 17v2M14 17v2M17 17v2" />
  </svg>
);

/** Everyone for themselves. Kept for completeness — the picker does not offer FFA. */
const Ffa = (): ReactElement => (
  <svg {...stroke}>
    <path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" />
  </svg>
);

export const MODE_ART: Record<GameMode, () => ReactElement> = {
  tdm: Tdm, boys: Boys, dom: Dom, bomb: Bomb, gungame: GunGame, ostrzyzeni: Ostrzyzeni, ffa: Ffa,
};

/**
 * Map plans. Not a render of the map — an abstract of its SHAPE, which is the thing a picker has to
 * tell apart at a glance: NIGHT_DISTRICT is a long street with blocks either side, GÓRA is two rings
 * around a stair core with an open light well. Anything else falls back to a plain footprint.
 */
const plan = {
  viewBox: "0 0 48 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.2,
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const NightDistrictPlan = (): ReactElement => (
  <svg {...plan}>
    <path d="M2 9h13v-6h10v6h8v-4h13v14h-13v-4h-8v6h-10v-6H2z" opacity=".55" />
    <path d="M2 12h44" strokeDasharray="3 3" opacity=".9" />
  </svg>
);

const GoraPlan = (): ReactElement => (
  <svg {...plan}>
    <rect x="4" y="3" width="40" height="18" rx="1" opacity=".55" />
    <rect x="14" y="8" width="9" height="8" rx="1" />
    <path d="M27 3v18M14 8h-10M23 16h21" opacity=".7" />
  </svg>
);

const GenericPlan = (): ReactElement => (
  <svg {...plan}>
    <rect x="4" y="4" width="40" height="16" rx="1" opacity=".55" />
    <path d="M18 4v16M30 4v16" opacity=".6" />
  </svg>
);

export const mapArt = (id: string): (() => ReactElement) =>
  id === "night_district" ? NightDistrictPlan : id === "gora" ? GoraPlan : GenericPlan;

/** Title-screen nav glyphs. */
export const NAV_ART = {
  play: (): ReactElement => (<svg {...stroke}><path d="M7 4.5 19 12 7 19.5z" /></svg>),
  settings: (): ReactElement => (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </svg>
  ),
  controls: (): ReactElement => (
    <svg {...stroke}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <path d="M6 10h1.5M9.5 10H11M13 10h1.5M17 10h1.5M8 13.5h8" />
    </svg>
  ),
} as const;
