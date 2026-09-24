/**
 * Drop U: how the HUD writes a number or a word. Pure, and the one place for it, so the clock, the
 * wallet and every pinned uppercase string are formatted the same way in every zone.
 *
 * Owned by P0 and frozen for the drop (docs/UI_U_SPEC.md §7.0): every package reads it, none edits it.
 */

/**
 * A clock as m:ss („4:12”, „0:03”, „15:00”). Seconds round UP, as the HUD's clocks always have:
 * a countdown reads 0:01 until the instant it is over, never 0:00 with time still left.
 */
export function fmtClock(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Money as the shop and the wallet print it: „$1,000”, „$0”, „-$300”. */
export const money = (n: number): string => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;

/**
 * Uppercase with the Polish locale („łądunek” → „ŁĄDUNEK”). Pinned strings are uppercased HERE, in
 * JS, and never with CSS `text-transform`: Playwright compares `textContent` (§3.3). Nicknames are
 * never passed through this.
 */
export const upperPl = (s: string): string => s.toLocaleUpperCase("pl-PL");

/**
 * The gallery's word count, IDENTICAL to `e2e/tools/hud-states.mjs` (§3.10): collapse whitespace,
 * split on spaces, count the tokens holding a Unicode letter or digit. So „·”, „—”, „/” and „→” are
 * not words, while „(3)”, „#3”, „+790”, „$4,100”, „12s”, „0:12”, „[B]” and „×3” are one word each.
 * `format.test.ts` checks the tool still carries the same rule.
 */
export function countWords(s: string): number {
  const text = s.replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * The Polish plural for a count, nominative: 1 → `one` (GRACZ), 2–4 and 22–24… → `few` (GRACZE),
 * everything else, 0, 5–21 and 25–31… → `many` (GRACZY). Returns the word only; the caller writes
 * the number (`${n} ${plPlural(n, "GRACZ", "GRACZE", "GRACZY")}`).
 */
export function plPlural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(Math.trunc(n));
  if (a === 1) return one;
  const d = a % 10, dd = a % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}
