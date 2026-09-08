import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoomHarness } from "./testHarness";

let h: RoomHarness;
beforeEach(async () => { vi.useFakeTimers(); h = await RoomHarness.create({ room: "dropC" }); });
afterEach(async () => { await h.dispose(); vi.useRealTimers(); });

it("sanitizes the skin field on join and leaves cosmetics alone while simulating", async () => {
  const a = await h.join("Skin owner", { skins: "pistol=osy,rifle=<script>,fake=osy" });
  const b = await h.join("Factory owner");
  expect(h.player(a.sessionId).skins).toBe("pistol=osy"); expect(h.player(b.sessionId).skins).toBe("");
  await h.advance(2000);
  expect(h.player(a.sessionId).skins).toBe("pistol=osy");
});
