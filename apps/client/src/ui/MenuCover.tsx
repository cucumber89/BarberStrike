import { useEffect, useRef } from "react";

/**
 * The live cover behind the menu (2.3). The scene itself lives in `game/view/MenuCover.ts` and is
 * loaded lazily so the menu paints before Babylon's chunk arrives; if WebGL2 is not there, the
 * canvas simply stays empty over the CSS gradient — the menu never depends on it.
 */
export function MenuCover({ dim }: { dim: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cover: { dispose(): void } | null = null;
    let cancelled = false;
    void import("../game/view/MenuCover").then(({ MenuCover: Cover }) => {
      if (cancelled) return;
      try { cover = new Cover(canvas); canvas.dataset.ready = "1"; }
      catch (err) { console.warn("[menu] cover disabled:", err); }
    }).catch((err) => console.warn("[menu] cover failed to load:", err));
    return () => { cancelled = true; cover?.dispose(); cover = null; };
  }, []);
  return (
    <>
      <canvas ref={ref} className="menu-cover" data-testid="menu-cover" aria-hidden="true" />
      <div className={`menu-cover-shade ${dim ? "dim" : ""}`} aria-hidden="true" />
    </>
  );
}
