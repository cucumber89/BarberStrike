import type React from "react";

/**
 * Drop U, P0 (seed for P4): the HUD's icon set (docs/UI_U_SPEC.md §2 Principle 7, §7 P0 0d). Where
 * CS2 draws an icon the HUD draws one too, instead of a word: the bomb, the cart, health and
 * armour, the two sides, the killer's skull, the grenades, the knife, the clippers and the spawn
 * bubble.
 *
 * Seeded UNUSED by P0. The names and the props are frozen for the drop (§7.0: "icons.tsx names
 * and props — P4 — all"); P4 may refine the drawings. Every icon is a 24×24 `currentColor` glyph,
 * so it takes the colour of the text it stands in for, and it is hidden from assistive tech unless
 * it is given a `title` (then it is an image with that name), like `Razor` and `HeadShot`.
 */
export interface IconProps {
  className?: string;
  /** The accessible name. Without one the icon is decorative (`aria-hidden`). */
  title?: string;
  /** Rendered width and height in px; default 20. */
  size?: number;
}

/** The shared frame: one `<svg>` for every icon, so they all size and colour alike. */
function Glyph({ className, title, size = 20, children }: IconProps & { children: React.ReactNode }): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="currentColor"
      aria-hidden={title ? undefined : true} role={title ? "img" : undefined} focusable="false">
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/**
 * The C4: three charges strapped together, a timer display on the front and a lead out of the
 * top — the block CS draws, rather than a case with a handle (P4 refinement; same name and props).
 */
export const IconBomb = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="2" y="8" width="20" height="13" rx="1.2" />
    <path d="M2 12.3h20M2 16.7h20" stroke="#000" strokeOpacity="0.35" strokeWidth="1" />
    <rect x="7" y="10" width="10" height="5.5" rx="0.6" fill="#000" opacity="0.55" />
    <path d="M9 12.8h2.2M12.6 12.8h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M17 8V5.5C17 3.6 15 2.6 13.4 3.5L11 4.8" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </Glyph>
);

/** The shop: a cart. */
export const IconCart = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M2 3h3.2l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h9.2l2.3-8.4H6.3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
    <circle cx="9.5" cy="19.5" r="1.7" />
    <circle cx="17" cy="19.5" r="1.7" />
  </Glyph>
);

/** Health: the medic's cross. */
export const IconCross = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />
  </Glyph>
);

/**
 * Armour: a plate carrier — two shoulder straps round the neck, the flared body and the waist
 * band — so at 20 px it reads as a vest and not as a block (P4 refinement; same name and props).
 */
export const IconPlate = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M6 2h3v4c0 1.4 1.3 2.4 3 2.4s3-1 3-2.4V2h3v5l3 2v11.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20.5V9l3-2z" />
    <path d="M3 15.5h18" stroke="#000" strokeOpacity="0.35" strokeWidth="1.4" />
  </Glyph>
);

/** The attack: a blade. */
export const IconSword = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M20.5 3.5 21 8 10.5 18.5 5.5 13.5 16 3z" />
    <path d="M4 15l5 5-1.5 1.5-1.8-1.8L3.5 22 2 20.5l2.3-2.2-1.8-1.8z" />
  </Glyph>
);

/** The defence: a shield. */
export const IconShield = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 2l8 3v6.2c0 5.2-3.4 9.3-8 10.8-4.6-1.5-8-5.6-8-10.8V5z" />
  </Glyph>
);

/** Who killed you: a skull. */
export const IconSkull = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 2C6.9 2 3.5 5.6 3.5 10.2c0 2.7 1.2 4.6 3 5.8V20a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4c1.8-1.2 3-3.1 3-5.8C20.5 5.6 17.1 2 12 2z" />
    <circle cx="8.6" cy="11" r="2.1" fill="#000" opacity="0.6" />
    <circle cx="15.4" cy="11" r="2.1" fill="#000" opacity="0.6" />
  </Glyph>
);

/** The frag: a round body under its lever and pin. */
export const IconFrag = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="11" cy="15" r="6.5" />
    <rect x="9" y="5.5" width="5" height="3.5" rx="0.8" />
    <path d="M14 6.5c2.5-1.5 4.8-.8 5.5 1.2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </Glyph>
);

/** The flashbang: a canister with a burst. */
export const IconFlash = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="8" y="9" width="8" height="12" rx="1.2" />
    <path d="M12 2v4M5.5 4.5l2.2 2.8M18.5 4.5l-2.2 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Glyph>
);

/** The smoke: a canister under a cloud. */
export const IconSmoke = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="9" y="13" width="6" height="9" rx="1" />
    <path d="M6.5 11.5a3.5 3.5 0 0 1 .6-6.9 4.6 4.6 0 0 1 8.6-1 3.9 3.9 0 1 1 1.8 7.9z" opacity="0.8" />
  </Glyph>
);

/** The molotov: a bottle with a flame at its neck. */
export const IconMolotov = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M10 9h4v2.5c1.8 1 3 2.8 3 5V21a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-4.5c0-2.2 1.2-4 3-5z" />
    <path d="M12 1.5c1.8 2 2.6 3.6 1.5 5.2-.7 1-2.3 1-3 0-.8-1.2 0-2.6 1.5-5.2z" />
  </Glyph>
);

/** The knife. */
export const IconKnife = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M3 17.5 16.5 4c2.3-.6 4 .2 4.5 1.5L8 18.5z" />
    <path d="M7 19.5l2.5 2.5L6 22.5 1.5 21z" />
  </Glyph>
);

/** Waiting: an open ring, turned by CSS. */
export const IconSpinner = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 3a9 9 0 1 1-9 9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  </Glyph>
);

/** The clippers: Ostrzyżeni's weapon and the shave in the feed. */
export const IconClippers = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="7" y="7" width="10" height="15" rx="3" />
    <path d="M6.5 2h11v4h-11z" />
    <path d="M8 2V.8M10.7 2V.8M13.3 2V.8M16 2V.8" stroke="currentColor" strokeWidth="1.2" />
  </Glyph>
);

/** The spawn shield: a bubble. */
export const IconBubble = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 8.5a5 5 0 0 1 4.5-2" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.7" />
  </Glyph>
);
