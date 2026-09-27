import { expect, it } from "vitest";
import type { RoomListing } from "../net/Connection";
import { DEATH_LINGER_MS, HOLD_MS, SPOT_MS, direct, initialDirector, pickStreamRoom, type DirectorPlayer } from "./streamDirector";

const room = (roomId: string, clients: number, name = ""): RoomListing => ({ roomId, clients, maxClients: 10, metadata: { name } });
const p = (id: string, alive = true, score = 0): DirectorPlayer => ({ id, alive, score });
const SPOTS = ["street", "shop", "overview"];

it("streams the fullest room, and never one with nobody playing", () => {
  expect(pickStreamRoom([room("a", 2), room("b", 6), room("c", 3)])?.roomId).toBe("b");
  expect(pickStreamRoom([room("a", 0), room("b", 0)])).toBeUndefined();
  expect(pickStreamRoom([])).toBeUndefined();
});

it("takes only the named room when one is asked for, even while it is empty", () => {
  const rooms = [room("x1", 8, "finał"), room("x2", 0, "turniej")];
  expect(pickStreamRoom(rooms, "turniej")?.roomId).toBe("x2");
  expect(pickStreamRoom(rooms, "x1")?.roomId).toBe("x1");
  expect(pickStreamRoom(rooms, "nie-ma")).toBeUndefined();
});

it("opens on the best player alive", () => {
  const s = direct(initialDirector(0), [p("a", true, 1), p("b", true, 9), p("c", false, 20)], SPOTS, 0);
  expect(s.shot).toEqual({ kind: "follow", id: "b" });
});

it("holds a living player for HOLD_MS, then cuts to the next one round-robin", () => {
  const players = [p("a", true, 3), p("b", true, 2), p("c", true, 1)];
  let s = direct(initialDirector(0), players, SPOTS, 0);
  expect(s.shot).toEqual({ kind: "follow", id: "a" });
  expect(direct(s, players, SPOTS, HOLD_MS - 1)).toBe(s);
  s = direct(s, players, SPOTS, HOLD_MS);
  expect(s.shot).toEqual({ kind: "follow", id: "b" });
  s = direct(s, players, SPOTS, 2 * HOLD_MS);
  expect(s.shot).toEqual({ kind: "follow", id: "c" });
  s = direct(s, players, SPOTS, 3 * HOLD_MS);
  expect(s.shot).toEqual({ kind: "follow", id: "a" });
});

it("lingers on a death before cutting away", () => {
  let s = direct(initialDirector(0), [p("a"), p("b")], SPOTS, 0);
  const dead = [p("a", false), p("b")];
  s = direct(s, dead, SPOTS, 1000);
  expect(s.shot).toEqual({ kind: "follow", id: "a" });
  expect(direct(s, dead, SPOTS, 1000 + DEATH_LINGER_MS - 1)).toBe(s);
  s = direct(s, dead, SPOTS, 1000 + DEATH_LINGER_MS);
  expect(s.shot).toEqual({ kind: "follow", id: "b" });
});

it("tours the map while nobody is alive, and jumps back to a player the moment one is", () => {
  let s = direct(initialDirector(0), [], SPOTS, 0);
  expect(s.shot).toEqual({ kind: "spot", id: "street" });
  expect(direct(s, [], SPOTS, SPOT_MS - 1)).toBe(s);
  s = direct(s, [], SPOTS, SPOT_MS);
  expect(s.shot).toEqual({ kind: "spot", id: "shop" });
  s = direct(s, [p("z")], SPOTS, SPOT_MS + 10);
  expect(s.shot).toEqual({ kind: "follow", id: "z" });
});
