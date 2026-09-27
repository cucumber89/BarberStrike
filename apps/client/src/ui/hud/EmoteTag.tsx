import { memo } from "react";
import { useHudSlice } from "../../game/store";

/**
 * The dance (H) I am doing, named under the crosshair's zone: which one, and how it ends. Shown only
 * while dancing; the camera is behind the body then, so the crosshair's space is free.
 */
export const EmoteTag = memo(function EmoteTag({ keyName = "H" }: { keyName?: string }) {
  const name = useHudSlice((s) => (s.alive ? s.emote : ""));
  if (!name) return null;
  return (
    <div className="emote-tag" data-testid="emote-tag">
      <b>♪ {name.toUpperCase()}</b>
      <small><kbd>{keyName}</kbd> albo ruch kończy taniec</small>
    </div>
  );
});
