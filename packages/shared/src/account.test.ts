import { describe, expect, it } from "vitest";
import { isValidLogin, LOGIN_RE } from "./account";

describe("isValidLogin (shared, client/server agree)", () => {
  it("accepts a plain lowercase login in range", () => {
    expect(isValidLogin("franki")).toBe(true);
    expect(isValidLogin("abc")).toBe(true);          // exactly 3, the minimum
    expect(isValidLogin("a_b_c_d_e_f_g_h_i_20")).toBe(true); // exactly 20, the maximum
    expect(isValidLogin("golarz_69")).toBe(true);
  });

  it("rejects too short", () => {
    expect(isValidLogin("ab")).toBe(false);
    expect(isValidLogin("")).toBe(false);
  });

  it("rejects too long", () => {
    expect(isValidLogin("a".repeat(21))).toBe(false);
  });

  it("rejects uppercase letters", () => {
    expect(isValidLogin("Franki")).toBe(false);
    expect(isValidLogin("ABC")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidLogin("frank i")).toBe(false);
    expect(isValidLogin(" franki")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isValidLogin("frank-i")).toBe(false);
    expect(isValidLogin("frank.i")).toBe(false);
    expect(isValidLogin("frank!")).toBe(false);
    expect(isValidLogin("frank@i")).toBe(false);
  });

  it("rejects diacritics (not in [a-z0-9_])", () => {
    expect(isValidLogin("łukasz")).toBe(false);
  });

  it("exposes the raw regexp for reuse", () => {
    expect(LOGIN_RE.test("ok_login")).toBe(true);
    expect(LOGIN_RE.test("NO")).toBe(false);
  });
});
