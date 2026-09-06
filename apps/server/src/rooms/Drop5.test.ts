import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S, S2C, CHAT, MARK, MATCH, MatchPhase, PLAYER, type ChatEvent, type MarkEvent } from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/** Drop 5: bots, chat, marks, assists. */

let h: RoomHarness;

beforeEach(() => { vi.useFakeTimers(); });

afterEach(async () => {
  await h.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const chats = (c: FakeClient): ChatEvent[] => h.sentOf(c, S2C.Chat).map((m) => m.payload as ChatEvent);
const marks = (c: FakeClient): MarkEvent[] => h.sentOf(c, S2C.Mark).map((m) => m.payload as MarkEvent);

describe("bots", () => {
  it("fill the room at creation, count towards the match, shop at spawn and move on their own", async () => {
    h = await RoomHarness.create({ room: "bots", mode: "tdm", bots: 2, botLevel: "normal" });
    expect(h.room.metadata.bots).toBe(2);
    const bots = Array.from(h.state.players.values()).filter((p) => p.bot);
    expect(bots.length).toBe(2);
    expect(bots.map((b) => b.team).sort()).toEqual([0, 1]);
    expect(bots.every((b) => b.name.length >= 2 && b.alive)).toBe(true);
    // Everyone starts with $2000: a bot spent some of it on a primary.
    expect(bots.every((b) => b.money < 2000 && b.owned.length >= 2)).toBe(true);
    // One human + two bots ≥ minPlayers: the match starts.
    const a = await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 200);
    expect(h.state.phase).toBe(MatchPhase.Playing);
    // Bots walk: positions change over a few seconds.
    const before = bots.map((b) => ({ x: b.x, z: b.z }));
    await h.advance(4000);
    const moved = bots.filter((b, i) => Math.hypot(b.x - before[i].x, b.z - before[i].z) > 1.5);
    expect(moved.length).toBeGreaterThanOrEqual(1);
    expect(h.room.handlerErrors).toBe(0);
    void a;
  });

  it("a hard bot shoots a human standing in plain sight and gets the kill credited", async () => {
    // A pinned PRNG: the bot's aim error and footwork are then the same every run.
    h = await RoomHarness.create({ room: "botkill", mode: "ffa", bots: 1, botLevel: "hard", seed: 12345 });
    const a = await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 200);
    await h.settle();
    const bot = Array.from(h.state.players.values()).find((p) => p.bot)!;
    // Face off: the human in front of the bot with line of sight, then the bot reacts and fires.
    await h.faceOff(bot.id, a.sessionId, 12);
    const hp0 = h.player(a.sessionId).health;
    await h.advance(3000);
    expect(h.player(a.sessionId).health).toBeLessThan(hp0);
    // The human stands still and never fires back; the bot finishes it (strafing may cost it a
    // moment of line of sight, so give it a generous window).
    for (let i = 0; i < 40 && h.player(a.sessionId).alive; i++) await h.advance(500);
    expect(h.player(a.sessionId).alive).toBe(false);
    expect(h.player(bot.id).kills).toBeGreaterThanOrEqual(1);
    expect(h.sentOf(a, S2C.Damaged).length).toBeGreaterThan(0);
    expect(h.room.handlerErrors).toBe(0);
  });
});

describe("chat and marks", () => {
  async function trio() {
    h = await RoomHarness.create({ room: "chat", mode: "tdm" });
    const a = await h.join("Alpha"); // team 0
    const b = await h.join("Bravo"); // team 1
    const c = await h.join("Charlie"); // team 0
    await h.advance(100);
    return { a, b, c };
  }

  it("delivers all-chat to everyone, team chat to the team, trims and rate-limits", async () => {
    const { a, b, c } = await trio();
    h.send(a, C2S.Chat, { text: "  hello   <all> ", team: false });
    await h.tick();
    expect(chats(a).at(-1)).toMatchObject({ name: "Alpha", text: "hello <all>", all: true, team: 0 });
    expect(chats(b).length).toBe(1);
    expect(chats(c).length).toBe(1);
    // Rate limit: a second line right away is dropped.
    h.send(a, C2S.Chat, { text: "spam", team: false });
    await h.tick();
    expect(chats(b).length).toBe(1);
    await h.advance(CHAT.minIntervalMs + 50);
    h.send(a, C2S.Chat, { text: "x".repeat(400), team: true });
    await h.tick();
    const last = chats(c).at(-1)!;
    expect(last.text.length).toBe(CHAT.maxLen);
    expect(last.all).toBe(false);
    expect(chats(b).length).toBe(1); // the enemy never sees team chat
    // Empty / non-string payloads are ignored without errors.
    await h.advance(CHAT.minIntervalMs + 50);
    h.send(a, C2S.Chat, { text: "   ", team: false });
    h.send(a, C2S.Chat, { text: 42 });
    await h.tick();
    expect(chats(b).length).toBe(1);
    expect(h.room.handlerErrors).toBe(0);
  });

  it("marks reach teammates only, must be near, and a spot needs a living target", async () => {
    const { a, b, c } = await trio();
    const s = h.session(a.sessionId).body;
    h.send(a, C2S.Mark, { x: s.x + 3, y: s.y, z: s.z + 3, kind: "go" });
    await h.tick();
    expect(marks(c).at(-1)).toMatchObject({ name: "Alpha", kind: "go", team: 0 });
    expect(marks(a).length).toBe(1);
    expect(marks(b).length).toBe(0);
    // Too soon: dropped. Too far: dropped. Spot without a target: dropped.
    h.send(a, C2S.Mark, { x: s.x, y: s.y, z: s.z, kind: "go" });
    await h.advance(MARK.minIntervalMs + 50);
    h.send(a, C2S.Mark, { x: s.x + MARK.maxRange + 50, y: s.y, z: s.z, kind: "go" });
    await h.tick();
    h.send(a, C2S.Mark, { x: s.x + 1, y: s.y, z: s.z, kind: "spot" });
    await h.tick();
    expect(marks(c).length).toBe(1);
    // A spot on Bravo carries the target id.
    h.send(a, C2S.Mark, { x: s.x + 1, y: s.y + PLAYER.eyeHeight, z: s.z, kind: "spot", target: b.sessionId });
    await h.tick();
    expect(marks(c).at(-1)).toMatchObject({ kind: "spot", target: b.sessionId });
    expect(h.room.handlerErrors).toBe(0);
  });

  it("counts assists on the scoreboard", async () => {
    const { a, b, c } = await trio();
    await h.advance(MATCH.countdownMs + 100);
    await h.settle();
    await h.arm(a, "rifle");
    await h.arm(c, "rifle");
    // Park the bystander first: a faceOff uses spawns[0]/[1] and a teammate standing there soaks the ray.
    await h.place(c.sessionId, h.map.spawns[6]);
    const aim = await h.faceOff(a.sessionId, b.sessionId);
    h.send(a, C2S.Fire, { seq: 1, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    h.send(a, C2S.Fire, { seq: 2, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() + 400 });
    await h.advance(400);
    h.send(a, C2S.Fire, { seq: 3, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    expect(h.player(b.sessionId).health).toBeLessThan(60);
    // Charlie finishes Bravo from the same spot: Alpha gets the assist. (Alpha parks far away — a
    // faceOff uses spawns[0]/[1], so moving Alpha to spawns[1] would put its body in the line of fire.)
    await h.place(a.sessionId, h.map.spawns[7]);
    await h.place(c.sessionId, { x: aim.o[0], y: aim.o[1] - PLAYER.eyeHeight, z: aim.o[2], yaw: 0, team: 0 });
    // Charlie's last aim is the same direction (a client would have sent it as an input).
    const cs = h.session(c.sessionId);
    cs.lastYaw = Math.atan2(aim.d[0], aim.d[2]); cs.lastPitch = -Math.asin(aim.d[1]);
    h.player(b.sessionId).health = 5;
    await h.advance(300);
    h.send(c, C2S.Fire, { seq: 1, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    expect(h.player(b.sessionId).alive).toBe(false);
    expect(h.player(c.sessionId).kills).toBe(1);
    expect(h.player(a.sessionId).assists).toBe(1);
  });
});
