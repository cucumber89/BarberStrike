import { describe, expect, it } from "vitest";
import { DUEL_MAP_IDS, MAPS, MAP_ORDER, MAX_BOTS, MODE_ORDER } from "@frankibarber/shared";
import {
  adminHeaders, botMaxFor, defaultQuickMap, duelMapChoices, healthRows, mapFootprint, mapLabel,
  modeLabel, occupancyLabel, phaseLabel, quickMapChoices, quickMatchBody, quickMatchLink, quickModeChoices, uptimeLabel,
} from "./adminConsole";

describe("admin console choices", () => {
  it("offers the duel arenas with each one's footprint read off its own bounds", () => {
    const choices = duelMapChoices();
    expect(choices.map((c) => c.id)).toEqual([...DUEL_MAP_IDS]);
    for (const c of choices) {
      const b = MAPS[c.id].bounds;
      expect(c.name).toBe(MAPS[c.id].name);
      expect(c.size).toBe(`${Math.round(b.maxX - b.minX)} × ${Math.round(b.maxZ - b.minZ)} m`);
    }
    expect(mapFootprint("banana")).toBe("");
  });

  it("offers every mode but the tournament for a quick match", () => {
    expect(quickModeChoices().map((m) => m.id)).toEqual(MODE_ORDER.filter((m) => m !== "turniej"));
    expect(quickModeChoices().map((m) => m.id)).not.toContain("turniej");
  });

  it("a duel picks among its arenas, everything else the shared order; the default follows the mode", () => {
    expect(quickMapChoices("duel").map((m) => m.id)).toEqual([...DUEL_MAP_IDS]);
    expect(quickMapChoices("tdm").map((m) => m.id)).toEqual([...MAP_ORDER]);
    expect(defaultQuickMap("duel")).toBe(DUEL_MAP_IDS[0]);
    expect(defaultQuickMap("ffa")).toBe(MAP_ORDER[0]);
  });

  it("caps bots the way the menu does and clamps the request body", () => {
    expect(botMaxFor("duel")).toBe(1);
    expect(botMaxFor("tdm")).toBe(MAX_BOTS);
    expect(quickMatchBody("duel", "dolna", "  x ", 5, "hard")).toEqual({ mode: "duel", map: "dolna", room: "x", bots: 1, botLevel: "hard" });
    expect(quickMatchBody("tdm", "gora", "y".repeat(30), -1, "easy")).toEqual({ mode: "tdm", map: "gora", room: "y".repeat(24), bots: 0, botLevel: "easy" });
  });

  it("the invite link for a quick match is the menu's own /r/<room>?mode=&map=", () => {
    expect(quickMatchLink("http://localhost:5174/viewer?x=1", "late-shift", "ffa", "gora")).toBe("http://localhost:5174/r/late-shift?mode=ffa&map=gora");
  });

  it("sends the key as a bearer token — the header the Colyseus preflight lets through", () => {
    expect(adminHeaders("sekret")).toEqual({ "content-type": "application/json", authorization: "Bearer sekret" });
  });
});

describe("admin console labels", () => {
  it("names every phase in Polish, a match's and a waiting room's", () => {
    expect(phaseLabel("waiting")).toBe("CZEKA");
    expect(phaseLabel("countdown")).toBe("ODLICZANIE");
    expect(phaseLabel("playing")).toBe("GRA");
    expect(phaseLabel("prep")).toBe("PRZERWA");
    expect(phaseLabel("ended")).toBe("KONIEC");
    expect(phaseLabel("poczekalnia")).toBe("POCZEKALNIA");
    expect(phaseLabel("trwa")).toBe("TRWA");
    expect(phaseLabel("")).toBe("—");
  });

  it("prints the mode, the map and the occupancy the way the table shows them", () => {
    expect(modeLabel({ kind: "tdm", mode: "gungame" })).toBe("GUN");
    expect(modeLabel({ kind: "tournament-lobby", mode: "turniej" })).toBe("TURNIEJ");
    expect(mapLabel("gora")).toBe(MAPS.gora.name);
    expect(mapLabel("nope")).toBe("nope");
    expect(occupancyLabel({ players: 3, slots: 12, watching: 0 })).toBe("3 / 12");
    expect(occupancyLabel({ players: 3, slots: 12, watching: 1 })).toBe("3 / 12 · 1 widz");
    expect(occupancyLabel({ players: 3, slots: 12, watching: 4 })).toBe("3 / 12 · 4 widzów");
  });

  it("formats uptime and the health block, with dashes where the server said nothing", () => {
    expect(uptimeLabel(65)).toBe("00:01:05");
    expect(uptimeLabel(90061)).toBe("1 d 01:01:01");
    expect(uptimeLabel(Number.NaN)).toBe("00:00:00");
    const rows = healthRows({ ok: true, version: "2.1.0", uptime: 3600, players: 4, rooms: 2, tick: { maxMs: 3.5, meanMs: 0.42, ticks: 10 } });
    expect(rows.map((r) => `${r.label}=${r.value}`)).toEqual(["gracze=4", "pokoje=2", "tick max=3.5 ms", "tick średni=0.42 ms", "uptime=01:00:00", "wersja=2.1.0"]);
    expect(healthRows(null).every((r) => r.value === "—")).toBe(true);
  });
});
