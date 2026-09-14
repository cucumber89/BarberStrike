import { useEffect, useRef } from "react";
import type { WeaponId } from "@frankibarber/shared";
import { bandPx, DomSkinCanvas, fitsWeapon, renderSkin, type SkinDef, type SkinFrame, type Zone } from "@frankibarber/skins";
import { weaponFrame } from "../game/view/weaponMeshes";

/**
 * The skin's real art as a 2D picture: the right flank of the texture, cropped to the weapon.
 *
 * Cards, the crate reel and the reveal all draw from here, so what a player sees on a card is the
 * same paint that lands on the gun. Every (skin, weapon, size) is rasterised once into a small
 * offscreen canvas and kept; a reel of thirty cards costs thirty tiny paints on first open and
 * nothing after. Stale entries fall out oldest-first so the cache never outgrows a menu session.
 */
const cache = new Map<string, HTMLCanvasElement>();
const CACHE_LIMIT = 160;

export function firstWeaponFor(skin: SkinDef, preferred: WeaponId = "rifle"): WeaponId {
  return fitsWeapon(skin, preferred) ? preferred : skin.weapons === "all" ? preferred : skin.weapons[0];
}

export type ArtFocus = "body" | "receiver";
/** The window a card shows, in weapon metres: the whole gun, or the receiver where the hero sits. */
function focusZone(frame: SkinFrame, focus: ArtFocus): Zone {
  const pad = .012;
  if (focus === "body") return { z0: frame.body.z0 - pad, z1: frame.body.z1 + pad, y0: frame.body.y0 - pad, y1: frame.body.y1 + pad };
  const r = frame.receiver, w = r.z1 - r.z0, h = r.y1 - r.y0;
  const z: Zone = { z0: r.z0 - w * .3, z1: r.z1 + w * .3, y0: r.y0 - h * 1.1, y1: r.y1 + h * .7 };
  // Keep a card's proportions sane on a stubby pistol or a long rifle: at least 2:1, at most 3.2:1.
  const want = Math.min(3.2, Math.max(2, (z.z1 - z.z0) / (z.y1 - z.y0)));
  const height = (z.z1 - z.z0) / want, cy = (z.y0 + z.y1) / 2;
  const clampZ0 = Math.max(frame.z0, z.z0), clampZ1 = Math.min(frame.z0 + frame.zSpan, z.z1);
  return { z0: clampZ0, z1: clampZ1, y0: Math.max(frame.y0, cy - height / 2), y1: Math.min(frame.y0 + frame.ySpan, cy + height / 2) };
}

/** Pixel rectangle of a zone inside the right band of a frame rendered at `scale`. */
function zoneRect(frame: SkinFrame, zone: Zone, scale: number, both: boolean): { x: number; y: number; w: number; h: number } {
  const band = bandPx(frame, "right");
  const ppm = frame.width / frame.zSpan * scale;
  const x = (zone.z0 - frame.z0) * ppm, w = (zone.z1 - zone.z0) * ppm;
  const top = (band.y + band.h) * scale - (zone.y1 - frame.y0) * ppm;
  const h = (zone.y1 - zone.y0) * ppm;
  return both ? { x, y: top, w, h: h + band.h * scale } : { x, y: top, w, h };
}

export function paintSkinArt(skin: SkinDef, weapon: WeaponId, width: number, both = false, focus: ArtFocus = "body"): HTMLCanvasElement {
  const key = `${skin.id}:${weapon}:${width}:${both ? 2 : 1}:${focus}`;
  const hit = cache.get(key); if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const frame = weaponFrame(weapon);
  const zone = focusZone(frame, focus);
  const scale = width / ((zone.z1 - zone.z0) / frame.zSpan * frame.width);
  const full = document.createElement("canvas");
  full.width = Math.ceil(frame.width * scale); full.height = Math.ceil(frame.height * scale);
  const ctx = full.getContext("2d");
  const crop = zoneRect(frame, zone, scale, both);
  const art = document.createElement("canvas");
  art.width = Math.max(1, Math.round(crop.w)); art.height = Math.max(1, Math.round(crop.h));
  if (ctx) {
    renderSkin(skin, weapon, "pattern", new DomSkinCanvas(ctx, full.width, full.height), 0, { frame });
    art.getContext("2d")?.drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, art.width, art.height);
  }
  cache.set(key, art);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return art;
}

export function SkinArt({ skin, weapon, width = 320, both = false, focus = "body", className, alt }: { skin: SkinDef; weapon?: WeaponId; width?: number; both?: boolean; focus?: ArtFocus; className?: string; alt?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = firstWeaponFor(skin, weapon);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const paint = () => { const art = paintSkinArt(skin, target, width, both, focus); canvas.width = art.width; canvas.height = art.height; canvas.getContext("2d")?.drawImage(art, 0, 0); };
    // A grid of sixty cards paints only what is on screen; the rest paints as it scrolls into view.
    if (typeof IntersectionObserver === "undefined") { paint(); return; }
    let done = false;
    const observer = new IntersectionObserver(entries => { if (!done && entries.some(e => e.isIntersecting)) { done = true; observer.disconnect(); paint(); } }, { rootMargin: "200px" });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [skin, target, width, both, focus]);
  return <canvas ref={ref} className={className} role="img" aria-label={alt ?? `${skin.name} – grafika skina`} data-testid={`skin-art-${skin.id}`} />;
}
