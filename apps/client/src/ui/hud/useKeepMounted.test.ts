import { describe, expect, it } from "vitest";
import { keepMountedState } from "./useKeepMounted";

describe("keepMountedState", () => {
  it("an open layer is open, whatever the clock says", () => {
    expect(keepMountedState(true, 0, 0, 160)).toBe("open");
    expect(keepMountedState(true, 1000, 99_999, 160)).toBe("open");
  });

  it("a closed layer stays mounted for exactly `ms` after the close, then unmounts", () => {
    const closedAt = 5000;
    expect(keepMountedState(false, closedAt, closedAt, 160)).toBe("closing");
    expect(keepMountedState(false, closedAt, closedAt + 159, 160)).toBe("closing");
    expect(keepMountedState(false, closedAt, closedAt + 160, 160)).toBe("closed");
    // The result card's 400 ms (§6.1): present at +200, gone at +600 — the gallery pin's two reads.
    expect(keepMountedState(false, closedAt, closedAt + 200, 400)).toBe("closing");
    expect(keepMountedState(false, closedAt, closedAt + 600, 400)).toBe("closed");
  });

  it("a layer that was never open (no close time) is simply closed", () => {
    expect(keepMountedState(false, 0, 0, 160)).toBe("closed");
    expect(keepMountedState(false, 0, 100, 160)).toBe("closed");
  });

  it("a zero-length exit unmounts at once", () => {
    expect(keepMountedState(false, 5000, 5000, 0)).toBe("closed");
  });
});
