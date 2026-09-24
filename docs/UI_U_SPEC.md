# UI_U_SPEC — Drop U: "UI jak w CS/CoD"

Final build spec from Pokład 2 (MOSTEK), 2026-09-24, branch `claude/practical-bardeen-07gu1m`.
It builds on the jury's winning design **A** ("CS2-wierny. Jeden pasek, jeden baner, cztery rogi"), adds
every jury graft, honours every jury veto and fixes every blocker and major from Ultron's completeness
critic. Appendix A maps the grafts and vetoes; Appendix B maps the critic's findings to their fixes.

Baseline: the `before` gallery run (`apps/client/e2e/out/u/before/states.md`), 28 scenarios at 1600×900
with **1535 words, 884 text blocks, 298 text nodes under 12 px**, smallest text **9 px**.
Everything the player reads is **Polish** and quoted exactly („…”). The rest of this document is
English.

Locked decisions L1–L7 (`docs/PLAN_2_1.md:16-34`) hold:
- damage, tick, snapshot, prediction and server authority do not change;
- there is **no new schema field**, and `apps/server/src/schema.ts` and `packages/shared/src/types.ts`
  are not touched;
- there is one semantic change to an existing replicated field: `bomb.result` in duel, turniej and
  ostrzyżeni (P-SRV). The ledger records it as a behaviour change, and it is question Q2 (§9).

---

## 1 Goal

The owner's brief (2026-09-24), verbatim-ish: *"przebudowa UI w grze wszędzie prostsza i bardziej
domyślna czyli czytelna, a nie 1000 napisów i małe liczniki i mało czasu na wszystko; trzeba to
ustrukturyzować, żeby gra wydawała się prawdziwa, tak jak w CS GO czy Call of Duty. Nie tylko UI, ale
też przejścia i wszystko, przerwy podczas rozgrywki itp."*

Every in-match screen gets rebuilt to be simple, obvious and readable. Today it is a thousand captions
and tiny counters, and nothing stays up long enough to be read. The game should feel like a real
shooter (CS:GO/CS2, Call of Duty), and that covers more than the HUD:
- every moment has a set beat: loading, warm-up, countdown, freeze, round start, bomb plant, round end,
  halftime, match point, the last round, the verdict and the result;
- death has a beat too: the killer card, the death cam and spectating;
- so do the ESC menu, the Tab scoreboard and the buy menu;
- screen changes go through black;
- the breaks between rounds get CS2's rhythm and enough time to read them.

Every question a player asks gets one answer in one fixed place. Numbers are big and words are few.
Every timed piece of text stays on screen long enough to read, which is at most 3 words per second.

## 2 Principles

Each principle can be checked. The check names the test or the tool that proves it. Zone ids are
defined in §4.

1. **One question, one place.**
   - Time, score, round and the alive count live only in the top strip. Money lives only in the wallet.
     Health, armour and ammo live only in their corner plates.
   - Nothing is printed twice. A break does not repeat the score or the countdown, and the death card
     is gone once the round ends.
   - *Check:* the zone-scoped `textAbsent` pins. For example, „następna runda za” and the score never
     appear in the `banner` zone, and `[data-testid=death]` is absent in every break scenario.
2. **Big numbers, few words.**
   - Every in-match text is at least **13 px**, and only keycap letters may be 13 px. Everything else is
     at least **14 px**.
   - Every number read mid-fight is at least **28 px** (t3): the clock, the scores, money, armour,
     magazine and reserve, and the killer's HP.
   - Every zone stays within its word budget (§5.1). Every scenario stays within its `maxWords` (§5.2).
   - *Check:* `hud-states.mjs --budget`, columns `minFont`, `<13px`, `under12`, `words` and `zones`.
3. **Five sizes.**
   - Font sizes exist only as tokens (§3.1). A literal `font-size` appears only in `ui/hud/hud.css`.
   - A scenario uses at most **6** distinct computed sizes: t1–t5 plus the keycap size.
   - *Check:* `grep -nE 'font-size:\s*[0-9]' apps/client/src/ui/hud/*.css` prints only `hud.css`, and
     the gallery column `sizes` is ≤ 6.
4. **Reading budget.** Every *timed* element may show at most **3 words per second it is visible**,
   counted with `countWords` (§3.10). Timed elements are banners, alerts, the death card before it
   collapses, the bracket card, toasts, the weapon name, the verdict and the result card.
   - *Check:* `Moments.test.ts` (P5), `deathText.test.ts` (P1), `resultText.test.ts` (P6) and
     `bracketView.test.ts` (P2), with the numbers in §6.5.
5. **One banner and one alert at a time.**
   - The banner zone and the bracket card never show together.
   - While a banner is up, the alert slot may show only „reconnecting”, and the action slot only my own
     plant, defuse or capture bar.
   - *Check:* `bus.test.ts`, 1000 seeded push sequences, and `Moments.test.ts`.
6. **The aim point stays clean.** Nothing sits on the crosshair: no money toast, no kicker and no reload
   nag. Banners, the countdown digit, the intro block and the bracket card keep at least **16 px** clear
   of the crosshair at all three gate sizes.
   - *Check:* the `apart` pairs in §4.3.
7. **Icons where CS2 uses icons.** These are icons: the weapons in the kill feed and the death card,
   grenades, armour, the buy cart, the bomb, the role (sword or shield) and the history reasons.
   - Where e2e pins a word, the word stays as `sr-only` text at 14 px (for example „FLASZKA”). The tool
     counts `sr-only` text (§3.10), so it is used only where a test needs `textContent`. Every other
     accessible name goes in `aria-label`.
8. **The clock shows the time that matters now.**
   - It shows the word in warm-up and dim digits in the countdown.
   - It shows amber digits in the freeze, white digits in the round and dim digits in a break.
   - After a plant it shows **the bomb icon plus the red fuse digits**.
   - Round modes never show the match backstop clock (15:00, 9:35 or 30:00).
   - *Check:* `phase.test.ts`.
9. **My side is always on the left, named.**
   - In team modes my team is drawn on the left **with CSS `order` only**. `score-a` and `score-b` stay
     bound to team 0 and team 1.
   - The team name is always printed: FADE / TAPER, or OCALENI / OSTRZYŻENI. My side's name sits on a
     filled chip.
   - In FFA and gungame the left side is „TY” and the right side is the best other player, with the
     nick in its own case.
   - *Check:* the pure `stripSides()` in `TopStrip.test.ts`, and the gallery pin `leftOf` on
     `bomb-planted-defender` (myTeam 1).
10. **Polish everywhere on the HUD.**
    - Mode titles on HUD surfaces come from one table in `ui/hud/copy.ts`. The menu is not touched.
    - Error messages are codes mapped to Polish in `copy.ts`.
    - Item names (Frag, K-7 Buzzcut…) and Boys class names (Scout, Medic…) are proper names, as in a
      Polish CS2 client (§9 Q4).
    - Nicknames are never uppercased.
    - Strings that e2e pins are uppercased in JS, never with CSS `text-transform`.
    - *Check:* case-sensitive `caseText` pins, the English greps in P3/P6/P7, and G4 (no
      `text-transform` in any package CSS).
11. **Every moment moves, and briefly.**
    - Every enter animation lasts ≤ 600 ms, because the gallery freezes animations at 600 ms
      (`hudStates.tsx:66`).
    - Staged moments are timed from `serverNow` and `phaseEndsAt`, never with `animation-delay`.
    - Under `prefers-reduced-motion` there is **no animation at all**.
    - *Check:* the gallery columns `animMaxMs` ≤ 600 and, under `--reduced-motion`, `anims` = 0
      50 ms after mount.
12. **Zones never overlap.**
    - No two visible `[data-zone]` boxes intersect by more than 2 px.
    - The listed pairs keep their minimum gap at **1600×900, 1280×720 and 1024×576**.
    - Full-screen veils and the modal zones are excluded (§4.2).
    - *Check:* the gallery columns `overlaps` and `apart`.
13. **Only real state, never faked.**
    - The HUD reads only fields that are already replicated, plus what the client itself observed.
    - Anything the client did not observe is hidden or shown as an empty slot, never invented. That
      covers the round MVP for a player who joined mid-round and the history of rounds before joining.
    - *Check:* `hudFeed.test.ts` ("mvp null when the round start was not observed").
14. **No information a player has today is removed.**
    - The fuse seconds, the enemy's plant or defuse progress, the dropped-bomb state for attackers, the
      buy tail and the killer's name and weapon all stay. They move into their one place.
    - *Check:* §5.3 lists every bomb line today's HUD prints (`Hud.tsx:245-250`) with its new home, and
      each has a scenario.
15. **No full-screen GPU veils.**
    - Nothing larger than a small plate gets `backdrop-filter`.
    - A full-screen overlay (death vignette, ESC dim, result dim) keeps at least **95 %** of the alive
      frame rate.
    - *Check:* `veil-cost.mjs`, driven through real states.
16. **Testids and e2e are a contract.**
    - Every existing `data-testid` is kept unless §8.4 lists it as migrated.
    - A changed contract changes its test **in the same package**.
    - *Check:* the testid set diff in the P0 report, and the full e2e run in every package gate.

## 3 Tokens

All tokens live in `apps/client/src/ui/hud/hud.css`, which P0 owns and which is frozen after P0.
- They are scoped to `:where(.hud, .loading)`, so the menu and `:root` stay untouched.
- They are defined in P0 and **not used** until wave 2.
- Package CSS files may only reference them. A literal `font-size` outside `hud.css` fails G4.

### 3.1 Type scale

| token | value | px at 576 / 720 / 900 / 1080 high | used for |
|---|---|---|---|
| `--hud-t1` | `clamp(14px, 1.55vh, 17px)` | 14 / 14 / 14 / 16.7 | labels, kill feed, chat, eyebrows, key lines, strip row 2, scoreboard rows, `sr-only` text |
| `--hud-t2` | `clamp(17px, 1.9vh, 21px)` | 17 / 17 / 17.1 / 20.5 | mode line, action slot, banner line, spectate bar, buy row, plan names, toast |
| `--hud-t3` | `clamp(28px, 3.2vh, 34px)` | 28 / 28 / 28.8 / 34 | clock, scores, money, armour, alerts, killer nick and HP, bracket-card title, intro title |
| `--hud-t4` | `clamp(40px, 5vh, 60px)` | 40 / 40 / 45 / 54 | health, magazine, result title at stage C |
| `--hud-t5` | `clamp(64px, 9vh, 112px)` | 64 / 64.8 / 81 / 97.2 | banner titles, countdown digit, the verdict at stage B |
| `--hud-key` | `13px` | 13 | keycap letters only. This is the one exception to the 14 px floor. |

Graft: the t3 floor is **28 px** (design A had 26 px).

### 3.2 Faces, weights, tracking

- Faces and weights:
  - **Bebas Neue 400** for t3–t5 numbers and titles.
  - **Inter 600** for t1/t2 labels.
  - **JetBrains Mono 500** for the clock and money, with tabular numerals.
- **Weight 700 is never used.** `main.tsx:5-10` loads only 400 and 500, so today's bold is faked
  (`styles.css:621,630-631`).
- Tracking is `.04em` for numbers and `.12em` for uppercase labels. There are no other values; today
  there are 19.

### 3.3 Case

- Pinned strings are uppercased in JS with `upperPl` (`format.ts`): „FLASZKA”, „ŁADUNEK NA A”,
  „ZWYCIĘSTWO”, „PORAŻKA”, „RUNDA DLA …”. Playwright compares `textContent`
  (`multiplayer.spec.ts:151,465,871`).
- Nicknames keep the player's own spelling everywhere: „xXPiotrekXx”, never „XXPIOTREKXX”.
- No package CSS file may contain `text-transform`. P0 moves rules verbatim, so the moved
  `text-transform` rules land in package files (for example `.weapon-name` at `styles.css:153` and
  `.loading-stage` at `cinematic.css:209`), and each owner removes them in wave 2.
- The global `button{text-transform:uppercase}` rule (`cinematic.css:23`) stays; it is menu scope.

### 3.4 Colours

| token | value | meaning |
|---|---|---|
| `--hud-team0` | `#e7b62e` | FADE |
| `--hud-team1` | `#8f76e0` | TAPER. It is the hue of shared `TEAM_COLORS[1]`. It ends the HUD's green `#4d9f7b` (`cinematic.css:16`), which the world never used. |
| `--hud-accent` | `#e7b62e` | house brass: ZWYCIĘSTWO, the active tab |
| `--hud-ok` | `#7dff9a` | round-win eyebrow, healthy |
| `--hud-warn` | `#e5ae52` | freeze clock, low ammo, buy window ≤ 5 s, ZMIANA STRON, MECZBOL |
| `--hud-danger` | `#df4938` | fuse, round loss, PORAŻKA, low HP, reconnect |
| `--hud-money` | `#9fe0a8` | money and money toasts |
| `--hud-tx` | `#f4f0e7` | primary text, the live round clock |
| `--hud-tx2` | `#afc0ca` | secondary and dimmed text, the break clock, REMIS / KONIEC MECZU |

### 3.5 Plate

| token | value |
|---|---|
| `--hud-plate` | `rgba(5,15,20,.82)` |
| `--hud-plate-line` | `1px solid rgba(178,201,210,.2)` |
| `--hud-radius` | `2px` |
| `--hud-blur` | `8px`, used on small plates only (Principle 15) |
| `--hud-pad` | `8px 14px` |

### 3.6 Geometry

These are the shared boxes. Every package positions its zone with them, so pairs that cross package
lines hold by construction (§4.3).

| token | value |
|---|---|
| `--hud-edge` | `24px`. Every corner uses it; the stray 26 px values go away. |
| `--hud-strip-top`, `--hud-strip-h`, `--hud-strip-w` | `16px`, `56px`, `min(560px, 54vw)` |
| `--hud-topline-top`, `--hud-alert-top` | `80px`, `116px` |
| `--hud-feed-w` | `min(460px, calc(50vw - min(280px, 27vw) - 40px))`, which is 460 / 320 / 195.5 px at 1600 / 1280 / 1024 wide |
| `--hud-banner-top` | `clamp(120px, 20vh, 216px)`, which is 120 / 144 / 180 / 216 px at 576 / 720 / 900 / 1080 high |
| `--hud-banner-w` | `min(900px, 56vw, calc(100vw - 2 * (var(--hud-feed-w) + 36px)))`, which is 608 / 568 / 561 px at 1600 / 1280 / 1024 wide. The banner always keeps 12 px clear of a full kill feed. |
| `--hud-radar` | `clamp(144px, 19.5vh, 176px)` |
| `--hud-chat-w`, `--hud-chat-bottom` | `min(420px, calc(50vw - 256px))`, `148px` |
| `--hud-hint-w` | `min(560px, calc(100vw - 680px))` |
| `--hud-card-w`, `--hud-card-bottom` | `440px`, `128px`. Shared by the death card, the spectate bar and the resume prompt. |
| `--hud-action-y` | `60%` |
| `--hud-intro-left`, `--hud-intro-top`, `--hud-intro-w` | `8vw`, `max(calc(50% - 40px), 264px)`, `360px` |
| `--hud-row2-bottom`, `--hud-weapon-bottom` | `100px` (perks, gear), `148px` (weapon name) |

### 3.7 Banner

- The band is full width. Its background is `linear-gradient(90deg, transparent, rgba(5,15,20,.86) 20%,
  rgba(5,15,20,.86) 80%, transparent)`, with 2 px rules at top and bottom in the team or state colour.
  The band is a `veil` (§4.2).
- The **content box** carries `data-zone=banner`. It sits at `--hud-banner-top` with width
  `--hud-banner-w`, centred.
- A banner has **exactly three rows**:
  1. **Eyebrow**, at t1. It may hold two chips on one line, for example „WYGRANA” and „ZMIANA STRON”.
  2. **Title**, at t5, on one line.
  3. **One line**, at t2. Its parts are joined with „ · ”, for example „Ładunek wybuchł · MVP Kowal ·
     podłożenie”.
- With 12 px padding and 4 px gaps, its height is t1·1.2 + t5 + t2·1.2 + 32:

  | screen | banner box | crosshair arms (default settings, ±13 px) | gap |
  |---|---|---|---|
  | 1024×576 | y 120–253 | from y 275 | 22 px ✓ |
  | 1280×720 | y 144–278 | from y 347 | 69 px ✓ |
  | 1600×900 | y 180–333 | from y 437 | ✓ |

- The countdown digit and the bracket card use the same box.

### 3.8 Motion

| token | value |
|---|---|
| `--hud-fast` | 120ms |
| `--hud-base` | 200ms |
| `--hud-in` | 320ms |
| `--hud-out` | 240ms |
| `--hud-phase` | 600ms |
| `--hud-ease` | `cubic-bezier(.2,.8,.2,1)` |
| `--hud-ease-in` | `cubic-bezier(.4,0,1,1)` |

- Under `@media (prefers-reduced-motion: reduce)` every duration token is `0ms`, every `.hud`
  descendant gets `animation: none`, and pulses become static colours.
- `hud.css` also holds the shared keyframes, moved verbatim from `styles.css`: `pulse` (:83), `slide-in`
  (:144), `result-in` (:214), `reload-fill` (:292) and `toast-rise` (:310). It also holds the new,
  inert `hud-enter` keyframe for the zone stagger (§6.1).
- There is one hide rule, `.hud-hidden { opacity: 0; visibility: hidden; transition: opacity
  var(--hud-fast), visibility 0s linear var(--hud-fast) }`, which every §4.5 row uses. The one
  exception is the result card, which hides by opacity only (§4.5).

### 3.9 Stacking

`--z-strip 10 · --z-alert 15 · --z-banner 20 · --z-death 30 · --z-shop 40 · --z-scoreboard 45 ·
--z-result 50 · --z-pause 60 · --z-reconnect 70 · --z-fade 150`.
- The fade layer sits above `.loading`, which has z-index 100 (`cinematic.css:178`).
- The scoreboard sits above the shop, because Tab works while buying, as in CS2.
- The reconnect alert sits above everything but the fade, so it is readable under every overlay.

### 3.10 Counting words

`countWords(s)` in `format.ts` (P0) is **identical** to the tool's rule (`hud-states.mjs:72`):
- collapse whitespace;
- split on spaces;
- count the tokens that contain a Unicode letter or digit.

So „·”, „—”, „/” and „→” are not words. „(3)”, „#3”, „+790”, „$4,100”, „12s”, „0:12”, „[B]” and „×3”
are one word each.

The tool counts every text node that `checkVisibility` passes. That includes `sr-only` text: its range
rects keep their width (`hud-states.mjs:64-72`). A count that must not be read aloud as a word goes in
`aria-label` or `data-count`.

**Timed words** are the words that leave together when a timed element leaves.
- The persistent footer of the death card („WRACASZ W NASTĘPNEJ RUNDZIE”) moves on into the spectate
  bar, but it is still counted as static; this is conservative.
- **Live** values are glance values that tick while visible. There are exactly three: the killer's HP
  line on the death card (`killer-hp`), „ODRODZENIE ZA n” and clock digits. They count in the zone
  budget and are excluded from the per-second law.

## 4 Screen zones

### 4.1 The 1600×900 frame

```
x 0  24       200      324     496 520                   800                  1080 1104 1116          1576 1600
y ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
16│ ┌─RADAR 176─┐                   ┌────────── TOP STRIP 560×56 (top) ──────────┐    ┌─FEED ≤460 (feed)──┐ │
  │ │     N     │                   │▮▮▮▮▮ ⚔ [FADE] 4 │  0:12  │ 2 TAPER 🛡 ▮▮▮▮▮ │    │ nick ⌐╦ ✹ nick    │ │
  │ │ rim: A  B │                   │ ATAK            │RUNDA 5 / 12│              │    │ ≤5 rows × 30 + 4  │ │
72│ │           │                   └─────────────────────────────────────────────┘    │ ends y 194        │ │
80│ │           │                     TOP-LINE y 80, h 28: mode line │ flags A B C    └───────────────────┘ │
116│ │          │                     ALERT y 116, h 40, one at a time                                      │
180│ │          │            ╔══════ BANNER / BRACKET content 608 wide, y 180–333 ══════╗                  │
200│ └──────────┘            ║  eyebrow t1 · TITLE t5 · one line t2  (band full width)  ║                  │
212│ $4,100 +$300  (wallet)  ║                                                          ║                  │
250│ 🛒 [B] 12s              ╚══════════════════════════════════════════════════════════╝                  │
284│ ┌PLAN 300×≤200┐                                                                                        │
  │ │PLAN RUNDY 12s│                                                                                        │
410│ INTRO (countdown only)                          ┼ crosshair (800,450)                                  │
  │ left 8vw, 360 wide                                                                                     │
540│                              ACTION y 60 %, ≤ 420 wide                                                 │
620│ CHAT ≤ 6 lines                                                                                         │
  │ width min(420, 50vw−256)         DEATH / SPECTATE / PROMPT, bottom 128, 440 wide                      │
752│ (bottom 148)                                                           WEAPON NAME (bottom 148)       │
764│ PERKS 36×36 (bottom 100)                                               GEAR icons (bottom 100)        │
812│ ┌VITALS 300×64─┐              HINT bottom 24, ≤ 560 wide, 2 lines       ┌AMMO 240×64───┐              │
  │ │✚ 100 ▬▬ ▣ 50 │                                                         │ ⌐╦ 30 / 90    │              │
876│ └──────────────┘                                                         └──────────────┘              │
900└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Zones

Every zone root carries `data-zone`. **Zones never nest**: `LeftColumn` itself has no zone, and its
radar, wallet and plan are separate roots. "Owner" is the wave-2 package that owns the zone's component
and CSS (§7).

| zone | component | owner | box at 1600×900 | narrow screens (1280×720, 1024×576) |
|---|---|---|---|---|
| `top` | TopStrip (`.top-bar[data-mode]`) | P2 | top 16, 560×56, x 520–1080 | `--hud-strip-w`: 553 px at 1024 |
| `top-line` | ModeLine / FlagRow | P2 | y 80, h 28, centred, no plate, text-shadow | same |
| `action` | ActionPrompt | P2 | centred, y 60 %, ≤ 420 wide | same |
| `bracket` | BracketHud (between pairs only) | P2 | the banner box (§3.7) | same |
| `radar` | Minimap | P3 | (24, 24), 176×176 | `--hud-radar`: 144 |
| `wallet` | Wallet: money, toast, buy row | P3 | money y 212, buy row y 250 | follows the radar in a flex column (gaps 12 / 6) |
| `plan` | PlanPanel | P3 | y 284, 300 × ≤ 200 | header and option rows only, ≤ 100 px, at height ≤ 600 |
| `chat` | Chat | P3 | left 24, bottom 148, `--hud-chat-w`, ≤ 6 lines × 22 | ≤ 4 lines at height ≤ 760; ≤ 3 at ≤ 600; ≤ 2 while the plan card shows at ≤ 600 |
| `hint` | Hints | P3 | bottom 24, centred, `--hud-hint-w`, 2 lines of t1 | 344 px wide at 1024 |
| `vitals` | Vitals (health plate) | P4 | left 24, bottom 24, 300×64 | same |
| `perks` | Vitals (perk chips) | P4 | left 24, bottom 100, h 36 | same |
| `inv` | Inventory (ammo plate) | P4 | right 24, bottom 24, 240×64, **the same width in every state** | same |
| `gear` | Inventory (grenades, C4) | P4 | right 24, bottom 100, h 36 | same |
| `weapon` | Inventory (weapon name, 1500 ms) | P4 | right 24, bottom 148, ≤ 240 wide | same |
| `feed` | KillFeed | P4 | right 24, top 24, `--hud-feed-w`, ≤ 5 rows × 30 + 4 | 320 / 195.5 px wide |
| `crosshair` | Crosshair | P4 | centre; player settings, untouched | same |
| `banner` | Moments / RoundBanner, countdown digit | P5 | §3.7 | §3.7 |
| `alert` | Moments (alert slot) | P5 | y 116, h 40, centred, t3, 2 px rule | same |
| `intro` | Moments (Countdown only) | P5 | `--hud-intro-*`, no plate | same |
| `death` | DeathCard, spectate bar | P1 | centred, bottom 128, 440 wide | same |
| `prompt` | PauseMenu (resume prompt) | P7 | the death-card box; hidden while dead | same |
| `veil` | full-screen layers: smoke, flash, damage direction, scope (P4); death vignette (P1); banner band (P5) | P4 / P1 / P5 | full screen | **excluded** from overlaps and apart |
| `scoreboard` | ScoreboardOverlay | P6 | §4.4 | **excluded** (modal) |
| `result` | ResultLayer / MatchResult | P6 | §4.4 | **excluded** (modal) |
| `shop` | ShopLayer / Shop | P7 | §4.4 | **excluded** (modal) |
| `pause` | PauseMenu column (settings inside it are zone `settings`) | P7 | §4.4 | **excluded** (modal) |
| `settings` | SettingsPanel, beside the column | P7 (placement only) | §4.4 | **excluded**. No word budget: the panel is out of scope (§9). |
| `loading` | Loading card | P7 | full screen | **excluded** |
| `fade` | Fade (App level) | P7 | full screen | **excluded** |

A text node belongs to its nearest `[data-zone]` ancestor. Text with no zone is reported as zone
`none`, and it counts only toward the whole scenario.

### 4.3 `apart` pairs

Gaps are checked at 1600×900, 1280×720 and 1024×576. **Own** pairs have both zones in one package and
are gated in that package's G3. **Cross** pairs are checked at the integration and final gates (§7.0).
Cross pairs hold by construction, because both sides use the same geometry tokens (§3.6).

| pair | min gap | kind | why |
|---|---|---|---|
| `banner` × `crosshair`, `intro` × `crosshair`, `bracket` × `crosshair` | 16 px | cross (P5×P4, P2×P4) | the aim point stays clean (Principle 6). At 576 high the banner ends at 253 and the crosshair arms start at 275. |
| `banner` × `feed`, `bracket` × `feed` | 12 px | cross | `--hud-banner-w` leaves 12 px beside a full feed at every width |
| `banner` × `wallet`, `bracket` × `wallet`, `intro` × `wallet` | 12 px | cross | the left column |
| `feed` × `top` | 16 px | cross (P4×P2) | the `--hud-feed-w` cap |
| `chat` × `perks`, `action` × `chat`, `death` × `chat`, `intro` × `chat`, `bracket` × `chat`, `prompt` × `chat` | 12 px | cross | the busy bottom-left column (graft from design C) |
| `hint` × `vitals`, `hint` × `inv`, `alert` × `feed`, `top-line` × `feed`, `weapon` × `death` | 12 px | cross | narrow widths |
| `top` × `top-line`, `bracket` × `top` | 8 px, 16 px | own (P2) | the strip stack |
| `chat` × `wallet`, `plan` × `chat`, `hint` × `chat` | 12 px | own (P3) | the left column |
| `wallet` × `radar`, `plan` × `wallet` | 8 px | own (P3) | the flex column |
| `vitals` × `perks`, `inv` × `gear`, `gear` × `weapon` | 8 px | own (P4) | the corner stacks |

### 4.4 Overlays (modal zones)

- **Tab scoreboard (P6).**
  - Centred. Its top is `max(10vh, 88px)`, so it clears the strip. Width `min(1000px, 92vw)`, height
    ≤ 80vh.
  - From top to bottom: a header, the round history strip (round modes), my team, the enemy team. In
    turniej, the pair's two rows are followed by the `BracketPanel`.
  - It also opens over the shop.
- **Shop (P7).**
  - A card of `min(1360px, 96vw) × min(93vh, 860px)` with the 5 aisles side by side as columns.
  - One screen with no scrolling. This is a locked decision (`PLAN_2_1.md:238-239`).
- **ESC (P7).**
  - A left column at x 0, 380 wide, full height, with the plate at `.94` alpha.
  - The rest of the game is dimmed with `rgba(3,8,11,.55)` and no blur.
  - Settings open beside the column at x 380, width `min(760px, 100vw − 420px)`, with no nested scroll.
- **Result (P6).**
  - Stage A: no overlay.
  - Stage B: a full dim at `.6` with the verdict.
  - Stage C: a card of `min(1080px, 94vw) × ≤ 86vh`.

### 4.5 Visibility matrix

P0 puts these attributes on the `.hud` root. They are inert in P0.
- `data-alive`: `true` or `false`.
- `data-overlay`: a space-separated set of `tab`, `shop` and `pause`.
- `data-moment`: `model.moment`.
- `data-stage`: `A`, `B` or `C` in Ended.
- `data-banner="1"`: while `uiFlags.bannerUp` is set.

Every owner applies the rows for its own zones in its own CSS, with the hide rule from §3.8. The final
gate checks the whole table.

| root state | hidden | stays |
|---|---|---|
| `data-alive=false` | crosshair, vitals, perks, inv, gear, weapon (P4); action, top-line (P2); intro (P5); hint (P3); prompt (P7) | top, **wallet** (graft: money matters for the next buy), radar, feed, chat, death, banner, alert |
| `data-overlay~=tab` | **every zone except** `top`, `scoreboard` and the reconnect alert. That includes the shop card, which stays mounted with its listeners live. | the board and the strip |
| `data-overlay~=shop` | **every zone except** `shop`, `scoreboard` (while Tab is held) and the reconnect alert. The plan card stays **mounted**, because F1/F2 stay live (P3). The shop header carries the one-line vote strip `shop-plan` (P7). | the shop |
| `data-overlay~=pause` | **every zone except** `top`, `pause`, `settings` and the reconnect alert | the column and the strip, which shows that the match runs on |
| `data-banner=1` | the alert slot except reconnect (P5); the action slot except my own progress bar (P2); the plan card, which waits (P3) | – |
| `data-moment` ∈ {`break`, `halftime`} | top-line, action (P2); death (P1); plan (P3) | the banner, strip, wallet, radar, feed and chat |
| `data-moment=betweenPairs` | top-line, action (P2); death (P1); plan (P3) | the bracket card and the strip (clock and „DRABINKA”) |
| `data-moment=ended`, stage A | every zone except `top`, `banner`, `feed` and `alert` | the final-round banner |
| `data-moment=ended`, stages B and C | every zone except `result` and the reconnect alert | the result layer |

**The result card hides by opacity only.** It never uses `visibility` or `display`, because
`multiplayer.spec.ts:660-667` needs `summary` to be visible to Playwright from t = 0. Playwright counts
opacity 0 as visible; the gallery counts it as hidden (`hud-states.mjs:64`).

## 5 State table

### 5.1 Zone word budgets

These are the **package contract**: each package's G3 gates its own zones with them (§7.0).

| zone | budget |
|---|---|
| `top` | ≤ 9. Gungame, ffa and turniej ≤ 10; ostrzyżeni ≤ 11. Alive counts live in `aria-label`/`data-count`, never in text. |
| `top-line` | ≤ 6 |
| `action` | ≤ 5 |
| `bracket` | ≤ 18 |
| `radar` | 0 DOM words. Canvas letters are ≥ 14 px (`canvasMin`). |
| `wallet` | ≤ 4 |
| `plan` | ≤ 24 as the freeze card, ≤ 3 as the live chip |
| `chat` | by lines (§4.2). Chat words are player content and are not budgeted. |
| `hint` | ≤ 14 |
| `vitals` | ≤ 4 (with the Boys class header), otherwise ≤ 2 |
| `perks` | ≤ 2 per chip |
| `inv` | ≤ 2 |
| `gear` | ≤ 2 per item |
| `weapon` | ≤ 3 |
| `feed` | ≤ 3 per row, ≤ 5 rows |
| `crosshair` | ≤ 3 (the breath hint) |
| `banner` | ≤ 12 |
| `alert` | ≤ 6 |
| `intro` | ≤ 8 (with the digit) |
| `death` | round card ≤ 16 (14 static + 2 live); respawn card ≤ 9 (4 static + 5 live); spectate bar ≤ 12 |
| `prompt` | ≤ 4 |
| `scoreboard` | ≤ 110 |
| `result` | stage B ≤ 8; stage C ≤ 42 in round modes and ≤ 48 in continuous modes |
| `shop` | ≤ 130 |
| `pause` | ≤ 20; ≤ 26 with the leave confirmation; ≤ 46 with the team picker open |
| `loading` | ≤ 16; ≤ 26 when ready |

### 5.2 Scenarios

Every gallery scenario is listed. "Owner" is the package whose gallery file holds the scenario's state
fixture. Other packages add pins for their own zones in their own gallery files (§8.7).
- **`maxWords`** is the whole scenario at 1600×900, with the §4.5 rows applied. It is checked at the
  integration and final gates.
- The 28 old scenarios add up to **≤ 958 words**, against 1535 today (−38 %).
- `minFont` ≥ 13 and `under12` = 0 hold in every scenario.
- The fixture's photographed instant is stated where it matters.

| # | scenario | owner | what shows (exact Polish copy) | maxWords |
|---|---|---|---|---|
| 1 | `warmup` | P2 | Strip „FADE 0 · ROZGRZEWKA · 0 TAPER”: `timer` shows the word at t2, and row 2 shows „GRACZE 1/2” (`warmup-players`). Mode line (`objective`): „PIERWSI DO 40 ZABÓJSTW” (`copy.modeGoal`). Wallet „$800” with the cart and „[B]”, and no countdown (the window is Infinity) or „OTWARTY”. Health „100”, ammo „12 / 60”. No centre card, no rules paragraph. | 18 |
| 2 | `countdown` | P5 | The intro block (`intro`, left of the crosshair): eyebrow „DRUŻYNOWY DEATHMATCH”, title „NIGHT DISTRICT” (t3), line „GRASZ W FADE” (in ffa and gungame „KAŻDY NA SIEBIE”). In the last 3 s only, a digit „3” at t5 (`countdown`) on the banner line. Strip clock „0:03”, dimmed; row 2 „DO 40”. „START 3” is gone. The mode-line goal stays. | 24 |
| 3 | `countdown-aborted` (new) | P5 | Countdown → Waiting (a player left, `match.ts:15`). Alert (`countdown-aborted`) „ODLICZANIE PRZERWANE” for 1500 ms. The intro block leaves. The strip is back to „ROZGRZEWKA” and „GRACZE 1/2”. | 20 |
| 4 | `fight-start` (new) | P5 | Countdown → Playing, **continuous modes only**. Banner (`fight`) „WALCZ!” for 840 ms and nothing else. Round modes never show it (veto). | 16 |
| 5 | `tdm-live` | P2 | Strip „FADE 23 · 4:12 · 19 TAPER” with my side on a chip; row 2 „DO 40” (`score-goal`). Feed ≤ 5 rows: nick, weapon silhouette (`SHOP_ART`), headshot icon, assist „+ nick”. Health „100”, armour „50”, ammo „30 / 90”, frag icon. Wallet „$3,250”, toast „+$300”, and no ZABÓJSTWO. | 30 |
| 6 | `tdm-wave-prep` | P2 | Server-unreachable (`TdmRoom.ts:2048` "reserved") but coherent: amber clock „0:03” counting to `phaseEndsAt`, mode line „ZAMROŻENIE”, the cart and „[B]”. The clock pulses in the last 3 s. | 24 |
| 7 | `ffa-live` (new) | P2 | Strip left „TY 12” (`score-a`), clock „3:40”, right „18 xXPiotrekXx” (`score-b`); row 2 „DO 30”. If I lead, the right side is the runner-up. No team chip. | 26 |
| 8 | `dom-live-capturing` | P2 | Strip „FADE 61 · 5:03 · 54 TAPER”, row 2 „DO 100”. Flag row A B C as badges in the owner's colour, contested ones striped, with a 3 px capture bar. Action (`capture`) „PRZEJMUJESZ B · 62%” with a 200×4 bar. Alert (`flag-notice`, P5) „A DLA FADE” for 2600 ms in the team colour, replacing TOOK. | 32 |
| 9 | `boys-live` (new) | P2 | Like #8 with `.top-bar[data-mode=boys]`. The vitals plate header (P4) reads „Assault → Medic” (the next class only when it differs). Wallet „$1,250” „[B]”. The words „B: rola / sklep” are gone. | 34 |
| 10 | `bomb-freeze` | P3 | Strip „FADE ⚔ 4 ▮▮▮▮▮ · 0:12 · ▮▮▮▮▮ 2 🛡 TAPER”, row 2 „RUNDA 5 / 12” (`round-label`), my badge „ATAK” (`role-badge`), amber clock. Wallet „$4,100” „[B] 12s”. The plan card appears after the freeze banner. Attack: „PLAN RUNDY · 12s”, „[F1] OTWÓRZ ROLETĘ · 2”, „[F2] ZBURZ MUR W ZAUŁKU · 1”. Only the option I voted for, or the leading one, shows „+ Drugie wejście od Głównej ulicy.” and „− Obrona też może nim wyjść.”. Defence: „ATAK WYBIERA PLAN · 12s”, with no keys. No mode line, no English. Photographed 3 s into the freeze. | 48 |
| 11 | `bomb-live-carrier` | P2 | White clock „1:11”. Chip under the wallet „PLAN: OTWÓRZ ROLETĘ” (`plan-active`). C4 icon with keycap [T] in the gear row (`c4`), blinking on a site. Mode line (`bomb-hud`) „MASZ ŁADUNEK”. On a site the action slot shows „PRZYTRZYMAJ [T] · PODŁÓŻ”; while planting, a 240×6 bar with „PODKŁADANIE”. | 28 |
| 12 | `bomb-live-defender` (new) | P2 | Defence before the plant: mode line (`bomb-hud`) „BROŃ PUNKTÓW A / B”. | 28 |
| 13 | `bomb-live-escort` (new) | P2 | Attacker without the bomb: mode line „OSŁANIAJ NIOSĄCEGO ŁADUNEK”. | 28 |
| 14 | `bomb-dropped` (new) | P2 | Attacker, bomb dropped: mode line „ŁADUNEK UPUSZCZONY — PODNIEŚ GO”, and the radar shows the bomb icon at its spot (P3). Defenders see „BROŃ PUNKTÓW A / B”, as today (`Hud.tsx:248`). | 28 |
| 15 | `bomb-planted-defender` | P2 | The clock is a 28 px bomb icon plus the **red fuse digits „0:28”** (`timer`, `data-kind=bomb`, `aria-label` „ŁADUNEK A”). It pulses at 1 Hz, and at 2 Hz once fewer than `BOMB.defuseMs` (10 s) remain. Mode line (`bomb-hud.armed`) „ŁADUNEK NA A — ROZBRÓJ [T]”; the attack sees „ŁADUNEK NA A — PILNUJ”. Near the bomb: „PRZYTRZYMAJ [T] · ROZBRÓJ”. The radar shows the bomb on the site. myTeam = 1, so `score-b` is drawn **left of** `score-a` (pin `leftOf`). | 28 |
| 16 | `bomb-defusing` (new) | P2 | As #15 with T held: action bar 240×6 with „ROZBRAJANIE”. The clock keeps the icon and the digits. The fixture has 4 chat lines of ≤ 5 words each, which exercises `action` × `chat`. | 52 |
| 17 | `bomb-teammate-defusing` (new) | P2 | A teammate defuses: the mode line reads „Kasia_Brzytwa ROZBRAJA” with a 3 px bar under it. An enemy doing it reads „WRÓG PODKŁADA” / „WRÓG ROZBRAJA”, which keeps today's information (Principle 14). | 28 |
| 18 | `bomb-planted-alert` (new) | P5 | The first 2000 ms after the plant: alert (`bomb-planted`) „ŁADUNEK PODŁOŻONY · A” in danger red. The clock cross-fades to the icon and „0:39”. | 30 |
| 19 | `round-freeze-start` (new) | P5 | The first 2000 ms of a freeze. Banner (`round-start`) with an optional eyebrow: „MECZBOL · FADE”, „MECZBOL DLA OBU”, „OSTATNIA RUNDA POŁOWY”, „OSTATNIA RUNDA”, „DRUGA POŁOWA”, or in turniej the stage („PÓŁFINAŁ”). Title „RUNDA 5”. Line „ATAKUJESZ” or „BRONISZ” (bomb), or in turniej round 1 of a pair „Kowal vs RYSIEK”. | 26 |
| 20 | `bomb-round-won` | P5 | Banner (`round-end`, class `mine`): eyebrow „WYGRANA” in ok green, title „RUNDA DLA FADE” in the team colour, line „Ładunek wybuchł · MVP Kowal · podłożenie” (`round-mvp` on the MVP span). No score, no „następna runda za”. Strip clock „0:05”, dimmed. Toast „+$3,250”, no CAPTURE. | 34 |
| 21 | `bomb-round-lost` | P5 | Banner (class `theirs`): eyebrow „PRZEGRANA” in danger red, title „RUNDA DLA TAPER” in TAPER purple, line „Atak wybity · MVP xXPiotrekXx · 3 zabójstwa”. **No death card.** Vitals, ammo and gear are hidden (I am dead); the wallet stays with toast „+$1,400”. | 30 |
| 22 | `bomb-halftime` | P5 | The start of the round-7 freeze. Banner eyebrow „DRUGA POŁOWA”, title „RUNDA 7”, line „BRONISZ”. My role icon flips to the shield and my badge reads „OBRONA”. Amber clock „0:13”. | 24 |
| 23 | `bomb-halftime-break` (new) | P5 | The 15 s break after round 6: the round-end banner for 0–7000 ms, then the card (`halftime`): eyebrow „PRZERWA”, title „ZMIANA STRON”, line „Teraz bronisz · wszyscy zaczynają od $800” (`money(BOMB.startMoney)`). No score. Photographed at 9000 ms. | 28 |
| 24 | `duel-freeze` | P2 | Strip „FADE 1 ▮ · 0:12 · ▮ 0 TAPER”, row 2 „RUNDA 2 · DO 6”, amber clock. Wallet „[B] 12s”. No 1v1 line; one clock replaces today's four. | 18 |
| 25 | `duel-live-buytail` | P2 | White clock „0:58”. Under the money „[B] 3s”: the tail shows because P1 fixes `Game.ts:639`. No text line. | 18 |
| 26 | `duel-round-break` | P5 | Banner: eyebrow „WYGRANA”, title „RUNDA DLA FADE”, line „Przeciwnik wyeliminowany · Broń zostaje” (`round-end-carry` is the second span; the loser reads „Broń przepada”). After rounds 3, 6 and 9 a second eyebrow chip „ZMIANA STRON” in warn amber. Clock „0:04”, dimmed. Toasts show only the amount. | 26 |
| 27 | `duel-match-point` | P2 | Strip as in the round. Mode line (`duel-line`) „MECZBOL · FADE” in warn amber; at 5:5 „MECZBOL DLA OBU”, which fixes „BRONISZ MECZBOLU”. The round clock „0:42” is the only clock. | 18 |
| 28 | `turniej-freeze` (new) | P2 | Strip with the pair's nicks in their own case, cut at 12 characters. Row 2 (`bracket-strip`) „PÓŁFINAŁ · RUNDA 2”. No bracket card. The duel machine: freeze clock, buy tail, match point. Bystanders are not in the pips. | 22 |
| 29 | `turniej-round-break` (new) | P5 | Banner „RUNDA DLA ZDZICHU” (`round-end`), as in the duel, with no bracket card. A bystander gets class `watch` and no WYGRANA/PRZEGRANA eyebrow. | 26 |
| 30 | `turniej-between-pairs` (new) | P2 | Only in the 9000 ms between pairs. The strip shows the break clock and „DRABINKA”, with no sides. The pair card (`bracket-card`): eyebrow „ZDZICHU PRZECHODZI DALEJ”, line „6 : 4 · Przeciwnik wyeliminowany”, title „NASTĘPNA PARA · FINAŁ”, line „Kowal vs RYSIEK”, and my standing „GRASZ TERAZ”, „CZEKASZ NA SWOJĄ PARĘ” or „ODPADŁEŚ Z TURNIEJU”. The full bracket is on Tab (P6) and on the result's DRABINKA tab. | 30 |
| 31 | `turniej-walkover` (new) | P2 | A player left during a freeze (`TdmRoom.ts:1559-1573`): the same card with eyebrow „WALKOWER · ZDZICHU DALEJ” and no score line. | 28 |
| 32 | `turniej-waiting` (new) | P1 | A bystander during a pair: the death card without „WYELIMINOWANY”. Title „CZEKASZ NA SWOJĄ PARĘ” (or „ODPADŁEŚ Z TURNIEJU”) plus the spectate bar on the current pair. | 26 |
| 33 | `dead-next-round` | P1 | Round modes, the first 5300 ms. Eyebrow „ZABIŁ CIĘ”; nick „xXPiotrekXx” at t3 in the team colour, in its own case; the weapon silhouette with the short name „K-7” and the headshot icon; „37 HP” (`killer-hp`); „ZADANE 64 (3) · OTRZYMANE 100 (4)” (`killer-damage`, veto: words, not arrows); footer „WRACASZ W NASTĘPNEJ RUNDZIE”. A red radial vignette (`veil`) replaces the 55 % black. Hidden: crosshair, ammo, gear, perks, vitals, mode line. The wallet stays. | 32 |
| 34 | `dead-spectate` (new) | P1 | After 5300 ms the card collapses into the bar (`spectate`): „OBSERWUJESZ: Kasia_Brzytwa · 74 HP” at t2, „[LPM] NASTĘPNY · [PPM] POPRZEDNI” at t1, and „WRACASZ W NASTĘPNEJ RUNDZIE”. The camera is at the teammate's eye. | 30 |
| 35 | `dead-respawn` | P1 | Respawn modes: „ZABIŁ CIĘ”, the nick, the silhouette with „K-7”, „37 HP”, and the live line „ODRODZENIE ZA 3” with a draining 3 px bar. The delay is `respawnDelayMs`: 3000 in gungame, 2200 with the fade perk, 3200 otherwise. | 28 |
| 36 | `dead-selfkill` (new) | P1 | Eyebrow „ZGINĄŁEŚ”, no nick, line „ODRODZENIE ZA 3”. | 24 |
| 37 | `dead-in-break` (new) | P1 | The duel loser during the break: `round-end` present, `death` absent. | 26 |
| 38 | `late-join-spectate` (new) | P1 | Joined a bomb or duel room mid-round (`TdmRoom.ts:641-645`: dead with no killer). There is no death card, only the bar: „OBSERWUJESZ: Kasia_Brzytwa · 74 HP”, „[LPM] NASTĘPNY · [PPM] POPRZEDNI”, „DOŁĄCZYSZ W NASTĘPNEJ RUNDZIE” (`late-join`). | 28 |
| 39 | `infection-prep` | P2 | The role card (`role-card`, P5) for 2500 ms: a survivor sees „PRZETRWAJ” / „RYSIEK MA MASZYNKĘ”; the chaser sees „MASZ MASZYNKĘ” / „OGOL WSZYSTKICH”. Strip „OCALENI 1 · 0:06 · 0 OSTRZYŻENI”. Row 2 is a full-width `infection-line` „RUNDA 2 / 5 · 9 NIEOSTRZYŻONYCH”, which keeps `multiplayer.spec.ts:1027-1079` untouched. My badge reads „OCALONY”. Mode line (`mode-line`) „UCIEKAJ PRZED MASZYNKĄ” or „GOŃ I GOL”. One clock replaces today's three. | 28 |
| 40 | `infection-converted` (new) | P1 | Banner (`shaved-banner`, P5) for 1500 ms: „OSTRZYŻONY!” in danger red with „TERAZ TY GONISZ”. The death card line reads „WRACASZ Z MASZYNKĄ ZA 3”. | 24 |
| 41 | `gungame-live` | P2 | Left „TY 7/14”; only the `7/14` span carries `ladder`, whose exact text is pinned (`multiplayer.spec.ts:818,832`). Row 2 (`ladder-gun`) „C-20 Side Part → M-1”. Right „9/14 xXPiotrekXx” in its own case. Clock „5:03”. No empty grenade slots. | 22 |
| 42 | `gungame-last-weapon` (new) | P5 | Alert (`last-weapon`) for 1500 ms: „OSTATNIA BROŃ” (me) or „xXPiotrekXx NA OSTATNIEJ BRONI”. | 24 |
| 43 | `low-health-reloading` | P4 | Health „24” in danger red with a pulse, and the low-HP vignette (from `styles.css:82`). During the reload the digits stay: the magazine dims to 40 % and a 3 px bar runs under the plate, with no PRZEŁADOWANIE. A magazine at ≤ 25 % is warn, at 0 danger. Broken armour is a greyed plate icon with a crack for 900 ms, with no ZNISZCZONA. | 20 |
| 44 | `scoped` | P4 | „[SHIFT] WSTRZYMAJ ODDECH” at t1 with the breath bar **under** the text. A tube scope hides the radar, as today. | 24 |
| 45 | `weapon-switch` (new) | P4 | Weapon name (`weapon-name`) at t1 in the `weapon` zone for 1500 ms after `lastSwitchAt`, e.g. „P9 STRAIGHT RAZOR”; the silhouette cross-fades in 120 ms. | 22 |
| 46 | `shop-closed-flash` (new) | P3 | B pressed outside the window: the cart is crossed out and „SKLEP ZAMKNIĘTY” (`shop-closed`) shows for 1800 ms. In modes with no shop: „BEZ SKLEPU W TYM TRYBIE”. | 22 |
| 47 | `chat-busy` (new) | P3 | Bomb freeze with 6 chat lines (tags „[DRUŻYNA]” / „[WSZYSCY]”), a „+$300” toast, 3 perks, the wallet and the plan card. No pair intersects at 3 sizes. | 90 |
| 48 | `radar-rim-pins` (new) | P3 | Objectives beyond `MINIMAP.range` are 14 px letters „A” and „B” pinned to the rim, and „N” is on the rim. No compass strip. Off-map area is plate at 60 %, not a black hole. | 24 |
| 49 | `shop-open` | P7 | Five columns side by side: „PISTOLETY”, „ŚREDNIA PÓŁKA”, „KARABINY”, „WYPOSAŻENIE”, „GRANATY” (`shop-tab-1..5`). Header „SKLEP · $4,100 · 12s” (`shop-countdown`, warn ≤ 5 s) and the vote strip `shop-plan` „PLAN: [F1] OTWÓRZ ROLETĘ 2 · [F2] ZBURZ MUR 1”. A tile has its key „3·2”, the name at t2, the price at t2 and at most one of today's tags („nosisz”, „działa jeszcze 12 s”, „LUNETA”, „Brakuje $1,400” in `why-{id}`). The detail strip is one line; in CS modes it ends „+$600 ZA ZABÓJSTWO” (`CS_KILL_REWARD`). Footer „[1–5] DZIAŁ · [0–9] PRZEDMIOT · [B] ZAMKNIJ”. Gone: the instruction sentence, „Okno po odrodzeniu” in round modes, and the $300/+$50 footer in CS modes. An armed aisle writes „KARABINY · naciśnij numer z kafelka” in `shop-result`. The HUD under the card is hidden (§4.5). | 130 |
| 50 | `shop-open-bomb-tail` (new) | P7 | The shop in the 5 s tail after the release: header „SKLEP · $2,350 · 3s” in warn amber, no respawn wording, no vote strip. | 130 |
| 51 | `scoreboard` | P6 | Header (`sb-header`) „FADE 23 · 4:12 · DRUŻYNOWY DEATHMATCH · NIGHT DISTRICT · 19 TAPER”. My team first, the enemy below (`.sb-team`). Columns „K A D ✂ $ PKT PING”; `$` is empty for the enemy. Dead players at 50 % with a skull. Rows at t1 Inter with tabular numerals. Only the strip stays visible under it. | 120 |
| 52 | `scoreboard-bomb-history` (new) | P6 | A bomb freeze with the shop open and **Tab held**: the board sits over the shop, and the shop card is hidden. Header „FADE 4 · RUNDA 7 / 12 · 0:12 · ŁADUNEK · NIGHT DISTRICT · 2 TAPER”. History strip (`sb-history`): 12 slots of 18 px with reason icons in the winner's colour (✹ detonation, ✂ defuse, ☠ elimination, ⏱ time) and a gap after slot 6. Rounds before I joined are empty slots. | 130 |
| 53 | `scoreboard-turniej` (new) | P6 | Tab in a tournament: the pair's two rows, then `BracketPanel` (P2, read-only), which replaces the old per-freeze bracket card. | 90 |
| 54 | `pause` | P7 | Left column: „MENU” at t3, „MECZ TRWA DALEJ” at t1 in warn amber, „DRUŻYNOWY DEATHMATCH · NIGHT DISTRICT” (`pause-objective`). Buttons „WRÓĆ DO GRY”, „USTAWIENIA”, „ZMIEŃ DRUŻYNĘ” (hidden in duel and turniej), „PEŁNY EKRAN” (a small switch), „OPUŚĆ MECZ”. The version at t1, dimmed. No rules paragraph, no Pauza. Only the strip stays visible. | 28 |
| 55 | `pause-leave-confirm` (new) | P7 | Under OPUŚĆ MECZ: „NA PEWNO WYJŚĆ?” with „TAK, WYJDŹ” (`btn-leave-confirm`) and „ANULUJ” (`btn-leave-cancel`). | 34 |
| 56 | `pause-teams` (new) | P7 | The team picker open inline: „TWOJA STRONA”, the cards „FADE · 5 GRACZY · 2 BOTY · JESTEŚ TU” and „TAPER · 5 GRACZY · 2 BOTY · NIE — ta strona byłaby większa”, plus an answer line (`team-answer`) „Następną rundę zaczniesz w TAPER.” (§5.6). | 56 |
| 57 | `pause-settings` (new) | P7 | USTAWIENIA open: the panel (`settings`) sits beside the column (pin `leftOf`: `pause` left of `settings`), and `.set-body` does not scroll inside a scrolling card (pin `noScroll`). No word budget, because the panel is out of scope. | – |
| 58 | `match-end-final-round` (new) | P5 | Stage A, 0–3000 ms, round modes only. Banner eyebrow „OSTATNIA RUNDA”, title „RUNDA DLA FADE”, line „Ładunek wybuchł”, with no MVP (reading budget). The strip keeps the final score, and only `top`, `banner` and `feed` show. The result card is mounted at opacity 0. | 26 |
| 59 | `match-end-verdict` (new) | P6 | Stage B, 3000 ms: dim `.6`, then at the centre „ZWYCIĘSTWO” at t5 in brass (PORAŻKA in danger red, REMIS and KONIEC MECZU in tx2), „FADE 7 — 4 TAPER” at t3, and the short why at t2 (`result-verdict-why`) „Ładunek rozbrojony”. | 10 |
| 60 | `match-end-win` | P6 | Stage C (TDM):<br>• „ZWYCIĘSTWO” at t4, „FADE 40 — 33 TAPER” at t3, and the why „Pierwsi do 40 zabójstw” (`result-why`);<br>• tabs „PODSUMOWANIE” and „TABELA”;<br>• podium (`podium`): the top 3, nick and number, with ★ at #1;<br>• my 3 stats: the objective stat first, then K, A and D in that order;<br>• „+790 XP · POZIOM 4” with the bar, and „NAJGORSZA FRYZURA: Rysiek ×3”;<br>• „SZCZEGÓŁY” (the next goal and badges sit behind it);<br>• footer „ROZGRZEWKA ZA 12s” (`result-countdown`) and „WYJDŹ DO MENU”. | 42 |
| 61 | `match-end-loss` | P6 | Bomb, stage C: as #60 with „PORAŻKA” in `--hud-danger` (grey like KONIEC today) and the why „Atak wybity w ostatniej rundzie”. The same stat order in every mode. | 42 |
| 62 | `match-end-ffa` (new) | P6 | FFA, stage C. The score line is omitted, because podium #1 is the winner. I am 3rd or lower, so under the podium: „MIEJSCE #7 Z 12” (`placement`). | 48 |
| 63 | `match-end-turniej` (new) | P6 | Turniej, stage C: „ZDZICHU wygrał finał drabinki”, plus the third tab „DRABINKA”. | 44 |
| 64 | `loading` | P7 | Eyebrow: the map („NIGHT DISTRICT” or „GÓRA (DACH)”) from the menu's `mapId` prop. Title: the mode title from `copy.ts`, from the menu's `gameMode` prop. One line from `modeGoal` (`loading-objective`). A bar with „ŁADOWANIE MAPY” and „WRÓĆ DO MENU”. When joining by room id (mode unknown until `Game.ts:224`), the title is „DOŁĄCZANIE DO POKOJU” and there is no eyebrow. Gone: „WEJŚCIE / 03” and „AFTER HOURS”. The fixture is `loadStage 'map'` with **no mode in the store**. | 16 |
| 65 | `loading-ready` | P7 | As #64, plus „GRASZ W FADE”, the button „WEJDŹ DO MECZU”, and the key line „WASD RUCH · B SKLEP · ESC MENU” at 14 px. One „GOTOWE”. No shop-after-respawn sentence in BOMB. | 26 |
| 66 | `menu-error` (new) | P7 | The menu after a failed join (the runner's view `menu-error`; `Menu.tsx` untouched). Its notice reads the Polish text for the code `deploy-timeout`: „Nie udało się wejść do meczu. Połącz się ponownie.” No English. | – |
| 67 | `new-match-warmup` (new) | P5 | After Ended → Waiting: the alert (`new-match`) „NOWY MECZ · ROZGRZEWKA” for 1500 ms. In place of the ESC menu, the prompt (`resume-prompt`, P7) „KLIKNIJ, ŻEBY GRAĆ”. | 24 |
| 68 | `reconnecting` (new) | P5 | Alert (`reconnecting`) „UTRACONO POŁĄCZENIE · ŁĄCZĘ PONOWNIE…” in danger red with a spinner, static under reduced motion. It suppresses every banner. | 26 |
| 69 | `break-rejoin` (new) | P5 | The HUD mounts in the middle of a duel break and never saw a Playing→Prep edge. The round banner still shows, through the fallback `Prep && roundResult !== ''`. | 28 |

**New scenarios (41):** rows 3, 4, 7, 9, 12–14, 16–19, 23, 28–32, 34, 36–38, 40, 42, 45–48, 50,
52, 53, 55–59, 62, 63, 66–69.

### 5.3 The bomb mode line (every state today's HUD prints, `Hud.tsx:239-250`)

| state | where it goes now | exact copy |
|---|---|---|
| header „RUNDA x / 12 · ATAK · DO 7” | strip row 2 plus the badge (P2) | „RUNDA 5 / 12”, „ATAK” |
| freeze „B: SKLEP · START ZA Ns” | the amber clock plus the buy row (P2, P3) | clock „0:12”, „[B] 12s” |
| break „reason · NASTĘPNA RUNDA ZA Ns” | the round banner (P5) plus the dimmed clock | banner line, clock „0:05” |
| planted, attack | mode line | „ŁADUNEK NA A — PILNUJ” |
| planted, defence | mode line | „ŁADUNEK NA A — ROZBRÓJ [T]” |
| carrier | mode line plus the action slot on a site | „MASZ ŁADUNEK” / „PRZYTRZYMAJ [T] · PODŁÓŻ” |
| defence, not planted | mode line | „BROŃ PUNKTÓW A / B” |
| attack, dropped | mode line plus the radar icon | „ŁADUNEK UPUSZCZONY — PODNIEŚ GO” |
| attack, escort | mode line | „OSŁANIAJ NIOSĄCEGO ŁADUNEK” |
| buy tail „· SKLEP (B) JESZCZE Ns” | buy row (P3) | „[B] 3s” |
| my own plant or defuse („TRZYMAJ T · NIE RUSZAJ SIĘ”) | action bar (P2) | „PODKŁADANIE” / „ROZBRAJANIE” |
| a teammate's plant or defuse | mode line with a 3 px bar | „{nick} PODKŁADA” / „{nick} ROZBRAJA” |
| an enemy's plant or defuse | mode line with a 3 px bar | „WRÓG PODKŁADA” / „WRÓG ROZBRAJA” |

### 5.4 Round reasons (`roundText.ts`, P5)

Banners, stage A and stage B use the **short** text. `roundEnd().why`, stage C and the tests at
`resultText.test.ts:65-84` keep the **long** text. Stage C in round modes reads
`${short} w ostatniej rundzie` (graft).

| server string | long (kept) | short (≤ 3 words) |
|---|---|---|
| `BOMB DETONATED` | „Ładunek wybuchł” | „Ładunek wybuchł” |
| `BOMB DEFUSED` | „Ładunek rozbrojony” | „Ładunek rozbrojony” (`multiplayer.spec.ts:161`) |
| `DEFENDERS ELIMINATED` | „Obrońcy wyeliminowani” | „Obrona wybita” |
| `ATTACKERS ELIMINATED` | „Atakujący wyeliminowani” | „Atak wybity” |
| `SITE SECURED` | „Czas minął, ładunku nie podłożono” | „Czas minął” |
| `TRADE` | „Obaj padli — runda bez punktu” | „Obaj padli” |
| `ELIMINATED` | „Przeciwnik wyeliminowany” | „Przeciwnik wyeliminowany” |
| `TIME · EVEN` | „Czas minął przy równym zdrowiu” | „Czas — remis” |
| `TIME · MORE HEALTH` | „Czas minął — więcej zdrowia wygrywa” | „Czas — więcej zdrowia” |
| `SURVIVORS HELD` (new, P-SRV) | „Ktoś dotrwał nieostrzyżony do końca czasu” | „Ocaleni dotrwali” |
| `ALL SHAVED` (new, P-SRV) | „Wszyscy ostrzyżeni” | „Wszyscy ostrzyżeni” |

### 5.5 Errors (`copy.ts` codes, P0; mapping in `ui/errors.ts`, P7)

| code | raised where today | Polish |
|---|---|---|
| `load-timeout` | `App.tsx:85` | „Ładowanie trwało za długo. Spróbuj jeszcze raz albo obniż grafikę.” |
| `server-unreachable` | `App.tsx:210` (regex on network errors) | „Nie można połączyć z serwerem gry.” |
| `connection-lost` | `Game.ts:427` | „Utracono połączenie z serwerem.” |
| `connection-error` | `Game.ts:428` (the server's raw message goes to the console only) | „Błąd połączenia z serwerem.” |
| `room-full` | `App.tsx:211` | „Ten pokój jest pełny.” |
| `room-not-found` | `App.tsx:215` | „Nie ma takiego pokoju.” |
| `scene-timeout` | `Game.ts:247` | „Scena nie wystartowała. Obniż ustawienia grafiki.” |
| `deploy-timeout` | `Game.ts:842` | „Nie udało się wejść do meczu. Połącz się ponownie.” |
| `no-webgl` | renderer messages (`App.tsx:213,216`, regex /WebGL2\|WebGPU\|hardware acceleration/) | „Gra nie ruszy w tej przeglądarce: włącz akcelerację sprzętową albo WebGL2.” |
| `unknown` | `App.tsx:217` | „Coś poszło nie tak.” |

- `Game.ts` (P1) throws `new Error(ERR.deployTimeout)` and friends.
- `humanError` (moved by P7 into `ui/errors.ts`) returns `ERROR_TEXT[code]` for a code, and maps
  English regex matches to codes.
- It no longer matches `/startup|deployment/` on English text. The codes are the contract, which removes
  the coupling between P1 and P7.
- „Startup cancelled” stays internal and is never shown.

### 5.6 Team picker (P7, `TeamPicker.tsx:36-81`)

| today | Polish |
|---|---|
| „YOUR SIDE” / „changes take effect next round” | „TWOJA STRONA” / „ZMIANA OD NASTĘPNEJ RUNDY” |
| „{n} players · {m} bots” | „{n} GRACZY · {m} BOTY”, via `plPlural` (`format.ts`): 1 GRACZ / 2–4 GRACZE / 5+ GRACZY; 1 BOT / 2–4 BOTY / 5+ BOTÓW |
| „YOU ARE HERE” / „JOIN” / „JOIN NEXT ROUND” | „JESTEŚ TU” / „DOŁĄCZ” / „OD NASTĘPNEJ RUNDY” |
| „CAN'T — {why}” | „NIE — {why}” |
| why: balance / cooldown / mode / ended / same | „ta strona byłaby większa” / „przed chwilą zmieniałeś — odczekaj” / „ten tryb nie ma stron” / „mecz się skończył” / „już tu jesteś” |
| „You will start the next round with {T}.” | „Następną rundę zaczniesz w {T}.” |
| „You are now with {T}. Your money and gear came with you.” | „Grasz teraz w {T}. Pieniądze i sprzęt przeszły z tobą.” |
| „Cannot switch — {why}.” | „Nie można zmienić — {why}.” |

In ostrzyżeni the names are OCALENI and OSTRZYŻENI. In duel and turniej the picker is hidden.

## 6 Transitions and breaks

### 6.1 Transitions

| transition | trigger | ms | look | owner |
|---|---|---:|---|---|
| Menu → loading | GRAJ / a room row (`App.tsx:84`) | 440 | The `ui/Fade.tsx` layer (z 150, inside `.app`, testid `fade`) goes black 0 → 1 in 240 ms; Loading mounts under black; black 1 → 0 in 200 ms. | P7 |
| Loading → match | WEJDŹ DO MECZU (`App.tsx:124→138`) | 940 | Black in over 200 ms, held ≥ 100 ms until `spawnedAt > 0` plus 2 frames (`Game.ts:842-845`), then out over 400 ms. `.hud.entering` starts as the black starts to leave. Each zone runs `hud-enter` (240 ms, ±12 px): top at 0 ms; radar, wallet and feed at 60; bottom corners and chat at 120; the rest at 180. | P7 (rule inert in `hud.css`, P0) |
| Match → menu | OPUŚĆ MECZ confirmed, or WYJDŹ DO MENU | 1340 | Black in over 240 ms, then the menu keyart's `mm-keyart-in` for 1100 ms, **unchanged** (`cinematic.css:40,54`, veto). | P7 |
| Loading → menu | „WRÓĆ DO MENU” (`loading-cancel`, `App.tsx:193`) | 1340 | As Match → menu. | P7 |
| Error → menu | load timeout, disconnect, deploy or scene timeout, full or missing room (§5.5) | 1340 | As Match → menu. The menu notice (`Menu.tsx:231,323`, untouched) shows the Polish text. | P7 (+ P1 raises codes) |
| Warm-up → countdown | phase Countdown | 320 | The intro block slides in from −24 px over 320 ms. In the last 3 s the digit pops from scale 1.2 to 1 in 180 ms each second. Beeps at `phaseEndsAt − 3000/−2000/−1000`. | P5 |
| Countdown aborted | Countdown → Waiting (`match.ts:15`) | 1500 | The intro leaves in 240 ms and the digit is removed. Alert „ODLICZANIE PRZERWANE”: in 200, out 240. The clock goes back to „ROZGRZEWKA”. | P5 |
| Countdown → fight | the first Playing after Countdown, **continuous modes only** | 840 | Banner „WALCZ!”: in 200, hold 400, out 240. The clock brightness flashes 1.4 → 1 over 150 ms. Start stinger. | P5 |
| Freeze start | Prep after a break or after the countdown; the first 2000 ms of the freeze | 2000 | Banner „RUNDA n”: in 320, hold 1440, out 240. A match-point eyebrow glows twice for 500 ms. | P5 |
| Role card (ostrzyżeni) | freeze start, in place of „RUNDA n” | 2500 | In 320, hold 1940, out 240. | P5 |
| Freeze release | Prep → Playing in round modes | 200 | **No banner** (veto). The clock goes amber → white in 200 ms, and the strip brightness flashes 1.4 → 1 over 150 ms. The beeps and the start stinger play on the real release; today they play about 11 s early (`audio/index.ts:223-231`). | P2 + P5 |
| Last 3 s of the freeze | freeze with ≤ 3000 ms left | 200 | The clock pulses once a second, scale 1.08 → 1 over 200 ms, in step with the beeps. | P2 |
| Bomb planted | `bomb.stage → planted` | 2000 | The alert drops 8 px in 200 ms, holds, and leaves in 240. The clock digits cross-fade to icon plus red fuse digits in 200 ms, pulsing at 1 Hz, then 2 Hz under 10 s. The bomb beep interval shrinks linearly from 1000 to 150 ms over the fuse. | P2 + P5 |
| Alert (flag, last weapon, new match) | its event | 2600 / 1500 / 1500 | Drops 8 px with a fade in 200 ms, holds, leaves in 240. | P5 |
| Round end | a break starts (`moment` ∈ {break, halftime}) | 7000 (bomb, ostrzyżeni) / 5000 (duel, turniej) | At +250 ms, so the last hit stays visible, the banner comes in over 320. It holds until the break end minus 240, then leaves. Win or loss stinger. The death card fades out in 160 ms. | P5 (+ P1 for the card) |
| Halftime | the break after round `BOMB.halfRounds` (15 s) | 15000 | The round-end banner for 0–7000 ms, then a cross-fade (240 out, 320 in) to the ZMIANA STRON card until the end. At the round-7 freeze the role icons flip (rotateY 180° over 320 ms). | P5 + P2 |
| 1v1 side swap | a duel or turniej break with `round % DUEL.halfRounds === 0` | 5000 | No separate card: the eyebrow chip „ZMIANA STRON” in warn amber. | P5 |
| Between pairs | `moment = betweenPairs` (`TOURNAMENT.breakMs` 9000) | 9000 | The pair card comes in over 320 (scale .96 → 1 with a fade) and leaves in 240 when `startPair` begins the next freeze. | P2 |
| Match end, stage A | Ended, elapsed 0–3000 ms, **round modes** | 3000 | The final-round banner with the eyebrow „OSTATNIA RUNDA”. The strip keeps the final score. The result card is mounted from t = 0 at opacity 0 (e2e). | P5 + P6 |
| Match end, stage B | Ended, elapsed 3000–6000 (0–3000 in continuous modes) | 3000 | The dim goes 0 → .6 in 400 ms. The verdict scales 1.15 → 1 with a fade in 400. End stinger. | P6 |
| Match end, stage C | Ended, elapsed ≥ 6000 (≥ 3000 continuous) until `MATCH.endedMs` | 320 | The title moves up and shrinks from t5 to t4 (FLIP, 320 ms), and the body fades in over 320. **A Tab press or a result-tab click jumps straight to C** (graft). | P6 |
| New match | Ended → Waiting | 1900 | The result card fades out over 400 ms (it stays mounted with its listeners off). Alert „NOWY MECZ · ROZGRZEWKA” for 1500 ms. The prompt „KLIKNIJ, ŻEBY GRAĆ” fades in over 200 ms and **stays until a click** (pointer lock) or ESC (which opens the menu). The automatic ESC menu is suppressed for 2500 ms; after that, only a later loss of the pointer lock arms it, as today (`Hud.tsx:138-143`). | P5 + P6 + P7 |
| Death | `S2C.Kill` with victim = me (`Game.ts:326-340`) | 1000 | The red radial vignette comes in over 200 ms (clear centre, edges at `.45`, no backdrop-filter). The camera drops 0.9 m over 400 ms and turns to the killer over 600 ms. No roll, no FOV change, no chase cam, no outline (veto). My own zones fade in 160 ms. The killer card appears at +300 ms, rising 12 px with a 240 ms fade. | P1 |
| Death → spectate | 5300 ms after death in round modes (the card holds 5000 ms) | 440 | The card collapses into the spectate bar over 320 ms. The camera cuts to a teammate's eye inside a 120 ms black blink. | P1 |
| Switch the spectated player | LPM / PPM while dead with pointer lock | 120 | A 120 ms black blink, a cut, and the bar swaps the nick and HP. | P1 |
| The spectated player dies | the target's `alive` → false | 1120 | Hold on the body for 1000 ms, then a 120 ms blink to the next target. With no target left: the last view stays, and the bar reads „NIKOGO DO OBSERWOWANIA”. | P1 |
| Late join (round modes) | joined while Playing (`TdmRoom.ts:641-645`) | 240 | No card. The spectate bar with „DOŁĄCZYSZ W NASTĘPNEJ RUNDZIE” fades in over 240 ms. | P1 |
| Respawn | `S2C.Spawn` (`Game.ts:299-307`) | 240 | The card fades out in 160, the vignette in 240, and the zones return in 200. The camera pose is restored exactly. | P1 |
| ESC menu | ESC, or pointer lock lost (the 300 ms arming stays) | 200 | The dim goes 0 → .55 in 160 and the column slides from −24 px in 200. Closing takes 160. | P7 |
| Settings beside the column | USTAWIENIA | 160 | The panel slides from −12 px with a fade in 160 ms. Closing takes 120. | P7 |
| Team picker in the column | ZMIEŃ DRUŻYNĘ | 160 | The picker fades in under the button in 160 ms (no height animation). An answer line shows for 6000 ms (`TeamPicker.tsx:35`). | P7 |
| Tab scoreboard | Tab held or released, also over the shop | 120 | Fade with scale .98 → 1 in 120 ms. The zones in §4.5 go to their hidden state in 120. Leaving takes 100. | P6 (+ each owner for its zones) |
| Shop | B, or the automatic close at the end of the window (`Game.ts:685`) | 160 | Fade with translateY 8 → 0 in 160, and back. It stays mounted 160 ms on the way out with its listeners off (`useKeepMounted`). On the automatic close the cart under the money is crossed out for 600 ms. | P7 (+ P3) |
| Kill feed row | a new `KillEvent` | 6000 | Slides in over 160 ms (`slide-in`) and fades over its last 400 ms. | P4 |
| Money toast | `S2C.Money` | 2500 | Changes within 2500 ms **merge** into one „+$N”. It rises 8 px in 120 ms and fades over its last 500 ms. | P3 |
| Weapon switch | `h.weapon` changes (`lastSwitchAt`) | 1620 | The name comes in over 120 ms, holds 1200 and leaves over 300. The silhouette cross-fades over 120. | P4 |
| Shaved (role change) | `KillEvent.shave` with victim = me | 1500 | Banner „OSTRZYŻONY!” in danger red, 320 in and 240 out. | P5 |
| Reconnect | `h.reconnecting` | 200 | The alert slides in over 200 ms; the spinner turns once per second. It stays until the connection is back. | P5 |

### 6.2 Break timelines (server truth after P-SRV)

```
BOMB   Countdown 4 s (live) → [FREEZE 15 s: "RUNDA n" 0–2 s · plan vote · amber clock · beeps −3/−2/−1]
       → release (no banner) → LIVE ≤ 115 s (+5 s buy tail) → plant: alert 2 s, clock = 💣 + red 0:40…
       → round end → BREAK 7 s (banner +250 ms … −240 ms) → next FREEZE
       round 6 end → HALFTIME BREAK 15 s (0–7 s round-end banner, 7–15 s ZMIANA STRON card)
       → round 7 FREEZE: banner "DRUGA POŁOWA / RUNDA 7 / BRONISZ"
       deciding round → ENDED 20 s: A 0–3 s final round · B 3–6 s verdict · C 6–20 s card
DUEL   Countdown 4 s → FREEZE 15 s → LIVE 60 s (+5 s tail) → BREAK 5 s ("ZMIANA STRON" chip after
       rounds 3/6/9) → … first to 6 → ENDED 20 s (A/B/C as bomb)
TURNIEJ as DUEL per pair; pair decided → BETWEEN PAIRS 9 s (pair card only) → next pair's FREEZE
       (banner eyebrow = stage, line "Kowal vs RYSIEK"); final decided → ENDED 20 s
OSTRZYŻENI Countdown 4 s → FREEZE 10 s (role card 0–2.5 s) → LIVE 90 s → BREAK 7 s → ×5 → ENDED 20 s
TDM/FFA/DOM/BOYS/GUNGAME warm-up → Countdown 4 s (intro, digit in the last 3 s) → "WALCZ!" 0.84 s
       → PLAYING ≤ 7 min → ENDED 20 s: B 0–3 s verdict · C 3–20 s card
```

### 6.3 Phase model

`apps/client/src/ui/hud/phase.ts` is written by P0 to this spec and owned by P2. Its exports are frozen:
`derivePhase`, `usePhaseModel`, `endedStage`, `clockMs`, `urgent`, `stripSides` and `PhaseModel`.
Its inputs are the store plus a small **observation** record that the hook keeps: the last observed
Playing→Prep edge, and the bracket `at` latched at the current pair's first freeze.

**Mode and break.**
- `roundMode` = mode ∈ {bomb, duel, turniej, ostrzyzeni}. **Turniej is a duel everywhere**, as
  `TdmRoom.ts:265` already treats it.
- `inBreak` is hybrid (graft from design C).
  - The **primary** signal is an observed Playing→Prep edge whose `phaseEndsAt` is still current.
  - The **fallback** applies only when no edge was observed since mount, that is after a join, reload
    or reconnect: `bomb.stage === 'resolved'` in bomb; `Prep && roundResult !== ''` in duel, turniej
    and ostrzyżeni.
  - `breakSource` is `'edge' | 'fallback'`.
- `betweenPairs` applies to turniej in Prep only.
  - **Observed:** the bracket's `at` (`parseBracket(h.bracket).at`) differs from the `at` latched at the
    current pair's first freeze, or `max(scoreA, scoreB) ≥ DUEL.wins`.
  - **Fallback** (nothing latched): no ScoreRow is alive (`finishPair` and `withdrawFromBracket` kill
    everyone, `TdmRoom.ts:1549,1571`) and `roundResult !== 'TRADE'`.
  - This catches a **walkover during a freeze**, which has no Playing→Prep edge and scores below
    `DUEL.wins`.
  - Known limit: a walkover during a trade break reads as a round break for ≤ 5 s.

**Moment.**
- Waiting → `warmup`; Countdown → `countdown`; Playing → `live`.
- Prep → `betweenPairs`, else `halftime` (a bomb break after round `BOMB.halfRounds`), else `break`,
  else `freeze`.
- Ended → `ended`.

**Clock (`clockKind`, `clockEndsAt`).**

| clockKind | when | clockEndsAt |
|---|---|---|
| `warmup` | Waiting | 0 (shows the word) |
| `countdown` | Countdown | `phaseEndsAt` |
| `freeze` | freeze | `phaseEndsAt` |
| `bomb` | bomb, planted | `bomb.endsAt` |
| `round` | bomb live | `bomb.roundEndsAt` |
| `round` | duel, turniej, ostrzyżeni live | `phaseEndsAt` |
| `match` | continuous modes | `matchEndsAt` |
| `break` | any break or between pairs | `phaseEndsAt` |
| `none` | Ended | – |

`urgent` is true when a round has ≤ 10 s left or a match ≤ 30 s. The model holds deadlines, not
milliseconds, so it changes only on events; components tick their own clocks.

**Round.**
- In bomb, `round` is `bomb.round`, the current round (`bomb.ts:48`).
- Elsewhere it is `bomb.round` during a break (the rounds finished so far) and `bomb.round + 1`
  otherwise.
- `matchPoint`: −1 means none, 0 or 1 is that team, 2 is both. It uses `BOMB.wins` or `DUEL.wins`.
- The other flags are `lastOfHalf`, `lastRound`, `secondHalfStart` and `sideSwap`.

**Stages and sides.**
- `endedStage(model, serverNow)`: elapsed = `MATCH.endedMs − (phaseEndsAt − serverNow)`.
  - Round modes: **A** while elapsed < 3000, **B** until 6000, then **C**.
  - Continuous modes: **B** until 3000, then **C**.
- `mySide`: `atak`, `obrona`, `ocalony`, `ostrzyzony` or null.
- `stripSides(model, h)` returns `{left: 0 | 1 | 'me', right: 0 | 1 | 'best', order}`. It is pure, and
  `TopStrip.test.ts` pins it.

### 6.4 Timing constants

| constant | file | from → to | why | tests that pin it |
|---|---|---|---|---|
| `BOMB.breakMs` | `packages/shared/src/bomb.ts:12` | 5000 → **7000** | CS2's `mp_round_restart_delay`; the round-end banner needs time to be read. | By name: `Bomb.test.ts:48,66`. New `bomb.test` "BOMB.breakMs stays ≤ 9000", whose comment cites `multiplayer.spec.ts:165`. That poll goes 10000 → **12000** ms (P1, same drop). |
| `BOMB.halftimeMs` (new) and `bombBreakMs(round)` | `bomb.ts:12-16`, used at `TdmRoom.ts:1891` | none (halftime used 5000) → **15000** | CS2's `mp_halftime_duration`: 7 s of banner, then 8 s of ZMIANA STRON. | New `Bomb.test` "the break after round BOMB.halfRounds lasts BOMB.halftimeMs". `Bomb.test.ts:56` advances by `bombBreakMs(BOMB.halfRounds) + 100`. |
| `DUEL.breakMs` | `packages/shared/src/modes.ts:320` | 3000 → **5000** (not 6000, veto) | 11 × (15 + 60 + 5) = 880 s ≤ `DUEL.matchMs` 900, which leaves 20 s of slack. This respects the owner's 47 %-waiting note (`PLAN_2_1.md:890-893`). | By name: `Duel.test.ts:136,151,160,177,212`, `DuelPersonas.test.ts:71,90,135`, `Tournament.test.ts:48`. New `modes.test` "the longest decided duel fits DUEL.matchMs". |
| `OSTRZYZENI.breakMs` | `modes.ts:203` | 5000 → **7000** | The same banner as bomb. | By name: `Infection.test.ts:103,157`. The backstop at `TdmRoom.ts:1447-1448` recomputes itself. |
| `OSTRZYZENI.prepMs` | `modes.ts:200` | 8000 → **10000** | The 2.5 s role card plus time to buy. The backstop becomes 5 × (10 + 90 + 7) + 60 = 595 s (was 575). | No test pins 8000. |
| `MATCH.endedMs` | `packages/shared/src/constants.ts:134` | 15000 → **20000** | Three stages: A 3 s, B 3 s, C 14 s in round modes; B 3 s, C 17 s in continuous modes. | By name: `Duel.test.ts:224`, `DropE.test.ts:166`. |
| `MATCH.countdownMs` | `constants.ts:130` | 4000 → **4000** (unchanged, veto) | The countdown is live combat (`rounds.ts:29`), and `startMatch` wipes it. The intro fits into 4 s. | Unchanged: `TdmRoom.test.ts`, `Ready.test.ts` and ~30 others. |
| Respawn deadline | `apps/client/src/game/Game.ts:337`; server `TdmRoom.ts:295-299` | always `RESPAWN_DELAY_MS` 3200 → shared `respawnDelayMs(mode, {shaved, fade})` in `rounds.ts`: 3000 in gungame, 3000 for the shaved, 2200 with fade, 3200 otherwise. An ostrzyżeni survivor waits for the next round. | One source for the server rule and the client card, so the card reaches 0 on the frame the server revives. | New `rounds.test` "respawnDelayMs matches the server rule"; `hudFeed.test`. `Drop7.test.ts` stays green. |
| Beeps | `apps/client/src/game/audio/index.ts:217-231` | hard-coded 1/2/3 s, and `MATCH.prepMs − i·1000` after every Prep → `endsAt − 3000/−2000/−1000`, for the countdown and the freeze only | The "go" beep lands about 11 s early in a 15 s freeze today, and breaks count down to a freeze. | New `beeps.test.ts`. |
| Unchanged on purpose | `cs.ts:20,26`; `modes.ts:294`; `economy.ts:25` | `CS_ROUND.freezeMs` 15000, `buyTailMs` 5000, `TOURNAMENT.breakMs` 9000, `ECONOMY.buyWindowMs` 30000 | CS parity and pinned values. The pair card fits 9 s (§6.5). | `modes.test.ts:263-264`, `economy.test.ts:192-196`, `Bomb.test.ts:24`, `Duel.test.ts:99`, `cs-round-check.mjs:38`, `startup.spec.ts:46-50` |

The e2e budgets still hold:
- `multiplayer.spec.ts:143` allows 45 s to reach Playing; 4 s of countdown plus a 15 s freeze fits.
- `:165` needs round 2 within 12 s, and the break is 7 s.
- The server tests run on a fake clock (`RoomHarness.advance`), so the longer phases cost nothing.

### 6.5 Client moment timings and the reading budget

These live in `ui/hud/bus.ts` (P5), `deathText.ts` (P1), `resultText.ts` (P6) and `Bracket.tsx` (P2).

- **Banners** (at most one; the higher row wins; a lower item is dropped once its window has passed):

  | priority | banner | window |
  |---|---|---|
  | 1 | final round | Ended stage A, 0–3000 |
  | 2 | round end | break start +250 → break end |
  | 2 | halftime card | halftime break +7000 → end |
  | 3 | freeze start | freeze +0 → +2000 |
  | 3 | role card (ostrzyżeni) | freeze +0 → +2500 |
  | 4 | „WALCZ!” | 840 ms |
  | 5 | „OSTRZYŻONY!” | 1500 ms |

  Reconnect suppresses every banner. The bracket card (P2) is shown only in `betweenPairs`, where the
  bus schedules no banner.
- **Alerts** (at most one), in priority order: reconnect (while it lasts), plant (2000 ms), flag
  (2600 ms), last weapon (1500 ms), countdown aborted (1500 ms), new match (1500 ms). While a banner
  is up, only reconnect may show.
- **Action mode**: `'progressOnly'` while a banner is up, otherwise `'all'`. It is published through
  `uiFlags.bannerUp`.
- **Death card** (P1): it appears at +300 ms and collapses at +5300 ms (it holds 5000 ms).
- **Other timings**: toasts merge within 2500 ms (P3); the weapon name shows for 1620 ms (P4); a feed
  row lasts 6000 ms (P4).

**The reading-budget law** (graft from design B): the timed words (§3.10) must be ≤ 3 × the seconds
visible, where "visible" runs from the start of the enter animation to the end of the exit. The
worst cases use the §5.4 short reasons:

| item | worst case (timed words / seconds) | budget | test |
|---|---|---|---|
| freeze start | „MECZBOL DLA OBU” + „RUNDA 12” + „BRONISZ” = 6 / 2.0 | 6 ✓ | `Moments.test.ts` |
| bomb or ostrzyżeni round end | „PRZEGRANA” + „RUNDA DLA TAPER” + „Atak wybity · MVP xXPiotrekXx · 3 zabójstwa” = 10 / 6.75 | 20.2 ✓ | `Moments.test.ts` |
| duel or turniej round end | „WYGRANA ZMIANA STRON” + „RUNDA DLA FADE” + „Czas — więcej zdrowia · Broń zostaje” = 11 / 4.75 | 14.2 ✓ | `Moments.test.ts` |
| halftime card | „PRZERWA” + „ZMIANA STRON” + „Teraz bronisz · wszyscy zaczynają od $800” = 9 / 8.0 | 24 ✓ | `Moments.test.ts` |
| role card | „PRZETRWAJ” + „RYSIEK MA MASZYNKĘ” = 4 / 2.5 | 7.5 ✓ | `Moments.test.ts` |
| „OSTRZYŻONY!” | „OSTRZYŻONY! TERAZ TY GONISZ” = 4 / 1.5 | 4.5 ✓ | `Moments.test.ts` |
| „WALCZ!” | 1 / 0.84 | 2.5 ✓ | `Moments.test.ts` |
| alerts | „xXPiotrekXx NA OSTATNIEJ BRONI” = 4 / 1.5; „ŁADUNEK PODŁOŻONY · A” = 3 / 2.0 | 4.5 / 6 ✓ | `Moments.test.ts` |
| stage A | „OSTATNIA RUNDA” + „RUNDA DLA FADE” + short reason ≤ 3 = 8 / 3.0 | 9 ✓ | `Moments.test.ts` |
| stage B verdict | „ZWYCIĘSTWO” + „FADE 7 — 4 TAPER” + short why ≤ 3 = 8 / 3.0 | 9 ✓ | `resultText.test.ts` "stage B verdict ≤ 9 words for every outcome × reason" |
| stage C, round modes | 41 (turniej, with the DRABINKA tab) / 14.0 | 42 ✓ | `resultText.test.ts` "stage C words ≤ 3 × its seconds" |
| stage C, continuous | 44 (ffa with placement) / 17.0 | 51 ✓ | same |
| pair card | ≤ 16 / 8.7 (9000 − 320) | 26 ✓ | `bracketView.test.ts` "pairCard ≤ 18 words" |
| death card, round modes | static „ZABIŁ CIĘ” + nick + „K-7” + „ZADANE 64 (3) · OTRZYMANE 100 (4)” + „WRACASZ W NASTĘPNEJ RUNDZIE” = 14 / 5.0 (live: „37 HP”) | 15 ✓ | `deathText.test.ts` |
| death card, respawn modes | static „ZABIŁ CIĘ” + nick + „K-7” = 4 / 1.9 (the fade perk: 2200 − 300) (live: HP and „ODRODZENIE ZA n”) | 5.7 ✓ | `deathText.test.ts` |
| toast | „+$3,250” = 1 / 2.5 | 7.5 ✓ | `walletToasts.test.ts` |
| weapon name | „P9 STRAIGHT RAZOR” = 3 / 1.62 | 4.9 ✓ | gallery `zoneWords weapon ≤ 3` |
| shop closed | „BEZ SKLEPU W TYM TRYBIE” = 5 / 1.8 | 5.4 ✓ | gallery `zoneWords wallet` |

## 7 Work packages

### 7.0 Order, rules and gates

**Merge order** (veto): **P0 → P-SRV → wave 2 {P1 … P7} in parallel.**
- P-SRV is small, about 60 changed lines plus tests. It is built alone right after P0 and merged before
  any wave-2 merge.
- Wave-2 engineers may start while P-SRV is in inspection, but they merge after it.
- The hybrid break detection (§6.3) means a mistake in this order cannot turn the 15 s duel freeze into
  a "break", but the order is still enforced.

**Rules.**
- A package edits **only** its OWNS list. `git diff --name-only` outside that list rejects the whole
  package (Ultron: "kara za wyjście poza pakiet").
- Files P0 creates or edits for a wave-2 package ("seeded", marked (s) in §7.9) belong afterwards to
  exactly one wave-2 package.
- P0's own files are **frozen** after P0. A change request goes to Ultron as a P0 follow-up commit.
- **Module names:**
  - `pnpm test` includes `apps/client/src/moduleNames.test.ts`, and it stays green. Test files carry the
    module's exact case: `TopStrip.test.ts` beside `TopStrip.tsx`, and `Moments.test.ts` beside
    `Moments.tsx`.
  - The folder `ui/hud/` sits beside `ui/Hud.tsx`, so no module may import the folder itself. There is
    no `ui/hud/index.ts`, and every import names a file (`./hud/TopStrip`).
    `grep -rnE "from ['\"](\./|\.\./)+(ui/)?hud['\"]" apps/client/src` prints nothing.
  - CSS is always imported with its extension.
- Imports across packages are **read-only**, and these signatures are frozen for the drop:

  | export | owner | readers |
  |---|---|---|
  | `SHOP_ART` | P7 | P4, P1 |
  | `Razor`, `HeadShot` | P6 | P4, P1 |
  | `BracketPanel`, `standing`, `pairNames` | P2 | P6 |
  | `derivePhase`, `usePhaseModel`, `PhaseModel`, `endedStage`, `clockMs`, `urgent`, `stripSides` | P2 | P1, P3, P4, P5, P6, P7 |
  | `roundReasonText`, `roundReasonShort` | P5 | P2 (pair card), P6 |
  | `icons.tsx` names and props | P4 | all |
  | `respawnDelayMs`, `bombBreakMs`, `modeGoal` data | P-SRV | P1, P0 `copy.ts` |
  | `copy.ts`, `format.ts`, `uiFlags.ts`, `types.ts`, `useKeepMounted.ts` | P0 | all |
  | standalone mounts in `uiFit.tsx` (P0): `PlanPanel({h, onVote})` P3, `RoundBanner({h, model?, standalone?})` P5, `MatchResult({h, now, onLeave})` P6, `Shop({h, api, now})` P7 | owners | P0 |

- New CSS selectors are scoped under the package's zone roots or component classes. There are no bare
  element selectors: `grep -nE '^[a-z]' <own>.css` prints nothing.
- `useHudSlice` selectors return primitives or existing state references. A new object on every call
  re-renders in a loop under `useSyncExternalStore` (`store.ts:233-235`).
- Nobody edits `docs/*`. Ultron writes the ledger row and the Deferred entries at the end.

**Package gate G1–G7.** Every wave-2 package passes all of these, with evidence in its report.
- **G1** `pnpm typecheck`, `pnpm test` (including `moduleNames.test.ts`) and `pnpm build` are green
  (L7).
- **G2** `git diff --name-only` ⊆ OWNS.
- **G3** Run
  `node apps/client/e2e/tools/hud-states.mjs --label <pkg> --budget --zones <own zones> --only <proving
  ids> --sizes 1600x900,1280x720,1024x576`. It must exit 0. In `--zones` mode the tool gates **only**:
  - the §5.1 budgets of the listed zones;
  - `minFont ≥ 13` and `under12 = 0` for text whose zone is listed;
  - the **own** apart pairs (§4.3) whose zones are both listed;
  - `animMaxMs ≤ 600` for animations whose target is inside a listed zone;
  - every pin on the page. All pins always run, and a package may not break another package's pin.

  Output goes to `apps/client/e2e/out/u/<pkg>/`, with `states.md` and the PNGs. Other packages' zones
  still render the pre-drop UI in the package branch, so they are reported, **not gated**.
- **G4** `grep -nE 'font-size:\s*[0-9]|text-transform' apps/client/src/ui/hud/<own>.css` prints nothing.
- **G5** `hud-states.mjs --reduced-motion --zones <own> --only <ids>` reports `anims = 0` for the own
  zones.
- **G6** The full e2e passes: `multiplayer.spec.ts` 13/13 and `startup.spec.ts`, with the server on
  :2567 and `FB_DEV_TOOLS=1`.
- **G7** Every acceptance line has its evidence: a test name, `file:line`, a PNG path or a number. A
  claim without evidence counts as no claim.

**Integration run (after each wave-2 merge, by the Kwatermistrz).** Run
`hud-states.mjs --label int-<n> --budget` over all 69 scenarios at 3 sizes, on the merged branch. It
covers whole-scenario `maxWords`, global `minFont` and `under12`, overlaps and every cross apart pair.
- It is **reported, not blocking**, because some zones are still pre-drop until the last merge.
- Each run's table goes to `apps/client/e2e/out/u/int-<n>/states.md`, so any regression shows up
  immediately.

**Final gate (Bramka, after all of wave 2).** Everything below is blocking:
- `hud-states.mjs --label final --budget` over all 69 scenarios at 3 sizes, with every §5.2 `maxWords`
  (the 28 old ones ≤ 958 in total), `sizes ≤ 6`, overlaps 0 and every apart pair.
- `--reduced-motion` reports `anims = 0` everywhere.
- The global font-size grep prints only `hud.css`.
- `hud-bench.mjs` commits ≤ the P0 run.
- `veil-cost.mjs`: the dead, pause and result-B rows are each ≥ 95 % of alive.
- `menu-fit.mjs` 5/5 and `ui-fit.mjs` 8/8.
- The full e2e.

**Who fixes a final-gate failure:**
- If a zone is over its §5.1 budget, or an apart pair fails, the owning package gets the NAGANA and the
  fix.
- If a scenario is over `maxWords` while every zone in it is within budget, the spec was wrong. Ultron
  raises `maxWords` with a ledger note, and nobody is penalised.

---

### P0-skeleton: split Hud.tsx, add tokens, the contract and the gallery, with no visual change

P0 is built first and alone. It runs as small sub-commits, each hud-diffed (graft from design C, to cut
the blast radius). It must not change a single pixel.

**OWNS (frozen after P0):**
- `apps/client/src/ui/Hud.tsx`
- `apps/client/src/ui/hud/hud.css`, `apps/client/src/ui/hud/index.css`
- `apps/client/src/ui/hud/types.ts`
- `apps/client/src/ui/hud/format.ts`, `apps/client/src/ui/hud/format.test.ts`
- `apps/client/src/ui/hud/copy.ts`, `apps/client/src/ui/hud/copy.test.ts`
- `apps/client/src/ui/hud/uiFlags.ts`
- `apps/client/src/ui/hud/useKeepMounted.ts`, `apps/client/src/ui/hud/useKeepMounted.test.ts`
- `apps/client/src/ui/styles.css`, `apps/client/src/ui/cinematic.css`
- `apps/client/src/main.tsx`
- `apps/client/src/uiFit.tsx`
- `apps/client/src/hudStates.tsx`, `apps/client/src/gallery/index.ts`, `apps/client/src/gallery/fixtures.ts`
- `apps/client/hud-states.html`, `apps/client/e2e/tools/hud-states.mjs`

**Seeds.** P0 creates or edits these, then hands each to the named package:
- `ui/hud/{TopStrip, ModeLine, FlagRow, BracketHud, ActionPrompt}.tsx`, `phase.ts`, `phase.test.ts`,
  `top.css` → **P2**
- `ui/hud/{LeftColumn, Wallet}.tsx`, `left.css` → **P3**
- `ui/hud/{Vitals, Inventory, KillFeed, Crosshair}.tsx`, `icons.tsx`, `corners.css` → **P4**
- `ui/hud/{Moments, RoundBanner}.tsx`, `roundText.ts`, `roundText.test.ts`, `moments.css` → **P5**
- `ui/hud/DeathCard.tsx`, `death.css`, `game/store.ts` → **P1**
- `ui/hud/{ScoreboardOverlay, ResultLayer}.tsx`, `result.css`, `ui/MatchResult.tsx`, `ui/resultText.ts`,
  `ui/resultText.test.ts` → **P6**
- `ui/hud/{PauseMenu, ShopLayer}.tsx`, `screens.css` → **P7**
- `gallery/{death, top, left, corners, moments, end, screens}.ts` → P1, P2, P3, P4, P5, P6 and P7, in
  that order

**MUST NOT TOUCH:**
- `Game.ts`, `LocalPlayer.ts` and `TdmRoom.ts` (veto: no seams in P0);
- all server and shared code;
- `menu.css`, `Menu.tsx` and `hudBench.tsx`.

**WORK (sub-commits):**
- **0a** Commit the 3 untracked files (`hudStates.tsx`, `hud-states.html`, `e2e/tools/hud-states.mjs`)
  unchanged. Re-run `--label p0-base` and check that it equals `before`.
- **0b** Gallery and tool.
  - `hudStates.tsx` becomes the runner.
    - `gallery/fixtures.ts` gets the clocks T and S, the roster, `base()`, `radarFor` and the types:
      `Scenario` (with `maxWords`, `elapsed`, `view`) and `Pins` (§8.8).
    - `gallery/index.ts` merges `scenarios` and `pins` from the 7 package files, tagging each pin with
      its package.
    - The runner sets `window.__canvasText = []` before mount, and runs `invisible`, `leftOf`,
      `noScroll`, `caseText` and zone-scoped `textAbsent` along with today's `expect`/`text`.
    - It adds the view `menu-error`, which mounts `Menu` with an `error` prop.
  - The 28 states move verbatim to their owners' files (§5.2), and each existing pin moves to its zone
    owner's file (§8.7). The **41 new scenario states** are seeded from §5.2, with `maxWords` and empty
    pins.
  - `hud-states.mjs` gains:
    - `--sizes` (default `1600x900,1280x720,1024x576`), `--only`, `--zones <ids>`, `--budget` and
      `--reduced-motion`;
    - a per-zone breakdown (words, minFont, `<13px`), from the nearest `[data-zone]` ancestor;
    - `overlaps` (visible zone boxes intersecting by more than 2 px, excluding `veil`, `fade`,
      `scoreboard`, `result`, `shop`, `pause`, `settings` and `loading`);
    - `apart`, using the §4.3 table with its own/cross tags;
    - `<13px` and `sizes`;
    - `anims` (`document.getAnimations().length` 50 ms after mount, under reduced motion);
    - `animMaxMs` (the maximum `delay + duration` over animations with finite iterations; infinite
      pulses are listed separately);
    - `canvasMin` (the smallest font px in `window.__canvasText`).
  - `--budget` exits non-zero on any gated breach in the chosen scope (§7.0 G3 or the final gate).
- **0c** The contract and pure modules. Only `model` is wired, as a prop.
  - `store.ts` gets **types and defaults only**, with no producer:
    - `mapId`, `diedAt`;
    - `killer {id, name, team, weapon, headshot, assists, hp, armor, dealt, dealtHits, taken, takenHits,
      at} | null`;
    - `spectating {id, name, health} | null`, `lateJoin`;
    - `siteHere '' | 'A' | 'B'`, `nearBomb`;
    - `roundMvp {id, name, kills, why: 'plant' | 'defuse' | 'kills'} | null`;
    - `roundHistory {round, winner, reason}[]`;
    - `flagNotice` gains `flag` and `name` (`store.ts:158`);
    - `lastSwitchAt`, `ScoreRow.health`.
  - `types.ts`: `HudProps` (today's Hud props unchanged, plus an optional `entering`) and
    `ZoneProps {model}`.
  - `format.ts`: `fmtClock` (m:ss), `money` ('$1,000'), `upperPl`, `countWords` (§3.10) and `plPlural`.
  - `copy.ts`:
    - `MODE_TITLE`: tdm „DRUŻYNOWY DEATHMATCH”, ffa „KAŻDY NA SIEBIE”, dom „DOMINACJA”, boys „THE BOYS”
      (Q4), bomb „ŁADUNEK”, gungame „WYŚCIG BRONI”, ostrzyzeni „OSTRZYŻENI”, duel „POJEDYNEK”, turniej
      „TURNIEJ”.
    - `modeGoal(mode, limit)`, ≤ 5 words, uppercase: „PIERWSI DO {limit} ZABÓJSTW”, „PIERWSZY DO 30
      ZABÓJSTW”, „PIERWSI DO 100 PUNKTÓW”, „PODŁÓŻ ALBO ROZBRÓJ · DO 7”, „ZALICZ 14 BRONI”, „UCIEKAJ
      ALBO GOL · 5 RUND”, „DO 6 WYGRANYCH RUND”, „WYGRAJ SWOJĄ PARĘ”. The numbers come from the
      constants, not literals.
    - `SIDE_WORD`: ATAK, OBRONA, OCALONY, OSTRZYŻONY.
    - `mapTitle(mapId)`.
    - `ERR` and `ERROR_TEXT` (§5.5).
  - `uiFlags.ts`: a tiny external store for `overlay {tab, shop, pause}`, `bannerUp` and `entering`,
    with `useUiFlags`.
  - `useKeepMounted.ts`: `keepMountedState(open, closedAt, now, ms)`, which is pure, plus the hook.
  - `phase.ts` and `phase.test.ts` per §6.3, with the test names listed under P2.
  - `roundText.ts` takes `ROUND_REASON`, `roundReasonText`, `roundEnd` and `sideNames` out of
    `resultText.ts` **verbatim**. The 'round end' suite (`resultText.test.ts:65-84`) moves verbatim to
    `roundText.test.ts`.
- **0d** Split the JSX, one sub-commit per package group.
  - Every `ui/hud/*.tsx` gates itself with today's conditions and carries `data-zone` on its root (§4.2).
    Zones never nest.
  - Full-screen layers carry `data-zone=veil` and sit **outside** the zone roots: smoke, flash, damage
    direction and scope in Crosshair.tsx; the death overlay's backdrop in DeathCard.tsx.
  - Components read the store through `useHudSlice` with stable selectors, or through `React.memo` (the
    judge's graft).
  - `ResultLayer` and `ShopLayer` reproduce `Hud.tsx:542` and `:558` exactly. The conditional mounts stay
    (veto).
  - The listeners split: Tab (`Hud.tsx:112-125`) goes to `ScoreboardOverlay` and sets `uiFlags.overlay`;
    ESC and the 300 ms arming (`:112-143`) go to `PauseMenu`.
  - Other moves:
    - `objective` (`:495-499`) → ModeLine;
    - countdown (`:490-492`) and reconnect (`:487`) → Moments;
    - `RoundBreak` (`MatchResult.tsx:180-200`) → `RoundBanner`;
    - smoke, flash, damage direction, scope, cook and tac → Crosshair;
    - PlanPanel mounts inside LeftColumn.
  - The root keeps `low-health`, `dormant` and `debug`, and gains the §4.5 attributes plus the class
    `entering` from the prop. Nothing reads them yet.
  - `icons.tsx` is seeded with named exports, unused: IconBomb, IconCart, IconCross, IconPlate,
    IconSword, IconShield, IconSkull, IconFrag, IconFlash, IconSmoke, IconMolotov, IconKnife,
    IconSpinner, IconClippers, IconBubble.
  - `Hud.tsx` ends ≤ 120 lines.
- **0e** Move the CSS **verbatim, in the original order, without collapsing layers** (graft), one
  sub-commit per target file:

  | target | selectors |
  |---|---|
  | `top.css` | `.top-bar`, `.team-score`, `.ffa-score`, `.tname`, `.tscore`, `.timer*`, `.ladder-gun`, `.bomb-hud*`, `.bomb-progress`, the infection and shaved lines, `.duel-line`, `.flags`, `.flag*` except `.flag-notice`, `.capture`, `.bracket-strip`, `.bracket-card`, `.center-sub.objective` |
  | `left.css` | `.minimap`, `.wallet*`, `.money-toast*`, `.shop-closed-hint`, `.plan*`, `.chat*`, `.hint*`, `.boys-status` |
  | `corners.css` | `.health*`, `.armor*`, `.perk*`, `.ammo*`, `.reloading`, `.reload-bar`, `.gear*`, `.weapon-name`, `.killfeed`, `.kf-*`, crosshair, scope, cook, tac, flash, smoke, damage-dir, `.hud.low-health::after` |
  | `moments.css` | `.center-msg`, `.countdown`, `.prep*`, `.center-sub`, `.reconnect`, `.round-end*`, `.flag-notice` |
  | `death.css` | `.death*` |
  | `result.css` | `.result*`, `.summary*`, `.result-goal`, `.result-bracket`, `.scoreboard*`, `.sb-*` |
  | `screens.css` | `.shop*` (`styles.css:322-444`), `.pause*`, the team picker, `.loading*` (`styles.css:281-292,610`; `cinematic.css:177-228`), `.enter-game` |

  - The plate group (`styles.css:779-781`, `cinematic.css:230-242`) is split per selector into the owners'
    files.
  - The shared keyframes and the `.hud{--plate…}` variables go to `hud.css`.
  - `index.css` `@import`s `hud.css` and then the 7 files.
  - `main.tsx`, `hudStates.tsx` and `uiFit.tsx` import it between `styles.css` and `cinematic.css`, which
    keeps the cascade order.
  - `cinematic.css` keeps its tokens, the menu and the crates. `mm-keyart-in` is untouched.
- **0f** Tokens, and the ui-fit harness.
  - `hud.css` gets the tokens of §3 (unused), the `.hud-hidden` rule, the inert `.hud.entering` stagger
    and the geometry tokens of §3.6.
  - In `uiFit.tsx`:
    - **every harness mount is wrapped in `<div className="hud">`**. Today PlanPanel and Shop mount
      bare (`uiFit.tsx:106,111`), so the `.hud`-scoped tokens would resolve to nothing there;
    - `RoundBreak` becomes `RoundBanner` with `standalone`;
    - the CSS import is fixed.

**ACCEPTANCE:**
- `pnpm typecheck` and `pnpm test` ✓, including `moduleNames.test.ts`.
  - The only new client tests are `phase.test.ts`, `format.test.ts`, `copy.test.ts` and
    `useKeepMounted.test.ts`.
  - `resultText.test.ts` plus `roundText.test.ts` have the same number of assertions as
    `resultText.test.ts` has today.
  - `copy.test.ts`: "every error code has Polish text with no English word", "modeGoal ≤ 5 words for
    every mode", "MODE_TITLE covers every GameMode".
  - `format.test.ts`: "countWords equals the tool's token rule on 12 fixtures", "plPlural 1/2/5/12/22".
- `node apps/client/e2e/tools/hud-states.mjs --label p0 --sizes 1600x900`:
  - the 28 old scenarios have words, blocks, minFont and under12 **identical** to
    `out/u/before/states.md` (totals 1535 / 884 / 9 / 298);
  - the 41 new ones render with 0 page errors.
- `node apps/client/e2e/tools/hud-diff.mjs before p0` after **every** sub-commit 0b–0f: each of the 28
  PNGs differs by ≤ 0.2 %. The per-sub-commit table goes in the report.
- `wc -l apps/client/src/ui/Hud.tsx` ≤ 120, and every `apps/client/src/ui/hud/*.tsx` ≤ 250.
- `grep -cE 'top-bar|\.health\b|\.ammo\b|\.wallet|killfeed|bomb-hud|\.death\b|round-end|\.pause\b|\.shop|result-|scoreboard|\.loading' apps/client/src/ui/styles.css`
  = 0, and `grep -cE '\.hud\b|\.loading' apps/client/src/ui/cinematic.css` = 0.
- The directory-import grep (§7.0) prints nothing, and `ls apps/client/src/ui/hud/index.ts*` finds
  nothing.
- The set of `data-testid` values in `Hud.tsx` before the change equals the set in `Hud.tsx` plus
  `ui/hud/*.tsx` after it. The script and its empty diff go in the report.
- `git ls-files` lists the 3 gallery files. `states.md` has the columns `zones`, `overlaps`, `apart`,
  `<13px`, `sizes`, `anims`, `animMaxMs` and `canvasMin`, and the tool runs at 3 sizes. The P0 overlap
  and apart numbers are the **baseline**; they are not gated.
- `hud-bench.mjs --label p0` against `--label before`: commits ≤ before and totalMs ≤ before × 1.10
  (the judge's render-count check).
- `menu-fit.mjs` 5/5 PASS (`cinematic.css` is touched). `ui-fit.mjs` PASS on 8 sizes **with the `.hud`
  wrapper**.
- `startup.spec.ts:68,89,110,141` with the client only ✓, and the full e2e with the servers ✓. PNGs go
  to `apps/client/e2e/out/u/p0/`.

**PROVING SCENARIOS:** the 28 old ones, unchanged, and the 41 new ones, rendering without error.

---

### P-SRV: time to read, a real halftime, and a break signal without a new field

P-SRV is built alone after P0 and merged before wave 2.

**OWNS:**
- `packages/shared/src/bomb.ts`, `packages/shared/src/bomb.test.ts`
- `packages/shared/src/modes.ts`, `packages/shared/src/modes.test.ts`
- `packages/shared/src/constants.ts`
- `packages/shared/src/rounds.ts`, `packages/shared/src/rounds.test.ts`
- `packages/shared/src/plans.ts`, `packages/shared/src/plans.test.ts`
- `apps/server/src/rooms/TdmRoom.ts`
- `apps/server/src/rooms/Bomb.test.ts`, `Duel.test.ts`, `DuelPersonas.test.ts`, `Infection.test.ts`,
  `Tournament.test.ts`, `DropE.test.ts`

**MUST NOT TOUCH:** `schema.ts`, shared `types.ts`, `cs.ts`, `economy.ts`, and all client code.

**WORK:**
1. Apply the §6.4 constants.
   - Add `BOMB.halftimeMs = 15000` and
     `bombBreakMs(round) = round === BOMB.halfRounds ? BOMB.halftimeMs : BOMB.breakMs`.
   - `TdmRoom.ts:1891` uses `bombBreakMs(st.bomb.round)`.
2. A break signal that survives a reconnect, with **no new field**.
   - `beginDuelRound` sets `st.bomb.result = ""` before the Prep (right after `:1590`). Today only
     `startPair` clears it (`:1515`).
   - `stepInfection` writes `st.bomb.result = winner === "survivors" ? "SURVIVORS HELD" : "ALL SHAVED"`
     before the `endMatch` check (`:1744`), so the deciding round has it too.
   - `beginInfectionRound` clears it.
   - The ledger flags this as a **behaviour change to an existing replicated field** (veto; §9 Q2).
3. Money.
   - The round payout (`:1888`) uses the reason `p.team === winner ? "round" : "loss"`.
   - The plant bonus (`:1869`) uses the existing `"round"`. Per the veto there is no new `'plant'`
     member, and `types.ts:332` is untouched.
   - Result: the toast "+$3,250 CAPTURE" is gone. The DOM `capture` payouts (`:1993,2001`) are
     unchanged, and `Drop4.test.ts:105` stays green.
4. Extract `respawnDelayMs(mode, {shaved, fade})` into `rounds.ts`. `TdmRoom.respawnDelay`
   (`:295-299`) delegates to it with identical behaviour.
5. `PLANS` in Polish (`plans.ts:46-70`):

   | name | gain | cost |
   |---|---|---|
   | „OTWÓRZ ROLETĘ” | „Drugie wejście od Głównej ulicy.” | „Obrona też może nim wyjść.” |
   | „ZBURZ MUR W ZAUŁKU” | „Przejdziesz między zaułkiem a zapleczem.” | „Tracisz osłonę do pasa — idziesz odkryty.” |
   | „ZDEJMIJ SCHODY NA CZATOWNIĘ” | „Nikt nie trzyma kąta nad podwórzem.” | „Czatownia zamknięta dla obu stron.” |

   Every line is longer than 20 characters (`plans.test.ts:40-41`).
6. Fix the stale comments at `constants.ts:135-148` (dead waves) and `rounds.ts:6-15`.

**ACCEPTANCE:**
- `pnpm test` ✓ with these new named tests:
  - `Bomb.test` "the break after round BOMB.halfRounds lasts BOMB.halftimeMs", with `Bomb.test.ts:56`
    switched to `bombBreakMs(BOMB.halfRounds)`;
  - `Bomb.test` "round money arrives as round / loss, never capture";
  - `bomb.test` "BOMB.breakMs stays ≤ 9000", whose comment cites `multiplayer.spec.ts:165`;
  - `Duel.test` "bomb.result is empty through the freeze and holds the reason through the break";
  - `Tournament.test` "a pair decided by a walkover leaves bomb.result empty and every player dead";
  - `Infection.test` "the break carries SURVIVORS HELD / ALL SHAVED and the freeze clears it";
  - `modes.test` "the longest decided duel fits DUEL.matchMs" (11 × (15 + 60 + 5) = 880 ≤ 900);
  - `rounds.test` "respawnDelayMs matches the server rule: gungame 3000, shaved 3000, fade 2200, default
    3200".
- Unchanged and green: `modes.test.ts:263-264`, `economy.test.ts:192-196`, `Bomb.test.ts:24`,
  `Duel.test.ts:99`, `Drop7.test.ts`, `Drop4.test.ts:105` and `plans.test.ts:40-41`.
- `pnpm typecheck` ✓. `git diff --stat` does not list `apps/server/src/schema.ts` or
  `packages/shared/src/types.ts`.
- e2e `multiplayer.spec.ts:143` and `:165` pass 3 runs out of 3 with the 7 s break. The measured margin
  of the `:165` poll goes in the report. `node apps/client/e2e/tools/cs-round-check.mjs` still measures a
  15 s freeze.

**PROVING SCENARIOS:** `bomb-halftime-break`, `duel-round-break`, `infection-prep`, `break-rejoin`,
`turniej-walkover`, as seen in the full HUD at the final gate.

---

### P1-life: live HUD state, and death as in CS2 (card, death cam, spectating)

**OWNS:**
- `apps/client/src/game/Game.ts`
- `apps/client/src/game/store.ts` (s)
- `apps/client/src/game/hudFeed.ts`, `apps/client/src/game/hudFeed.test.ts`
- `apps/client/src/game/spectate.ts`, `apps/client/src/game/spectate.test.ts`
- `apps/client/src/game/player/deathCam.ts`, `apps/client/src/game/player/deathCam.test.ts`
- `apps/client/src/game/player/LocalPlayer.ts`, `apps/client/src/game/player/RemotePlayer.ts`
- `apps/client/src/ui/hud/DeathCard.tsx` (s)
- `apps/client/src/ui/hud/deathText.ts`, `apps/client/src/ui/hud/deathText.test.ts`
- `apps/client/src/ui/hud/death.css` (s)
- `apps/client/src/gallery/death.ts` (s)
- `apps/client/e2e/hudfeed.spec.ts`
- `apps/client/e2e/multiplayer.spec.ts`
- `apps/client/e2e/tools/veil-cost.mjs`

**MUST NOT TOUCH:**
- `LocalPlayer.test.ts`, `prediction.test.ts` and `RemotePlayer.test.ts`. They stay byte-identical and
  green, as proof that the input and prediction path is untouched (L6).
- Every `ui/*` file other than its own, and all server and shared code.

**WORK:**
- **(a) Buy context** at `Game.ts:638-639` and `:709`.
  - Duel **and turniej** use `bombBuying = Prep && roundResult === '' || now < release + buyTailMs`.
  - `release` is `phaseEndsAt − DUEL.roundMs` in duel and `bomb.roundEndsAt − BOMB.roundMs` in bomb.
  - It passes `windowEndsAt`, as the server does at `TdmRoom.ts:2228-2240`.
  - Result: the window is 0 in a break, and the 5 s tail is visible.
- **(b) Respawn deadline:** `respawnAt = diedAt + respawnDelayMs(mode, {shaved, fade})`. For an
  ostrzyżeni survivor it is "next round".
- **(c) Killer data** on `S2C.Kill` (`Game.ts:326-340`):
  - `hp` and `armor` from `conn.state.players` (`schema.ts:28,55`);
  - `headshot` and `assists` from `KillEvent` (`types.ts:273,282`);
  - `dealt`, `dealtHits`, `taken` and `takenHits` summed from `S2C.Hit` and `S2C.Damaged`
    (`Game.ts:314-323`) over the current life;
  - `diedAt`.

  A kill with killer = me, or with no killer, is a self-kill.
- **(d) Sites:** `siteHere` comes from the map's sites and `BOMB.useRadius`. `nearBomb` is set for a
  defender close to a planted bomb.
- **(e) Round MVP and history.**
  - Kills per round are counted from an **observed** Prep→Playing edge.
  - `bomb.actor` is latched when the stage becomes planted, and again on resolved plus BOMB DEFUSED.
  - The MVP is the defuser on BOMB DEFUSED, the planter on BOMB DETONATED, and otherwise the player with
    the most kills on the winning side.
  - There is an MVP **in bomb only**. It is `null` when the round start was not observed.
  - History is appended on each observed break edge. Rounds that were not observed are absent, never
    invented (veto).
- **(f) Flag notice** (`Game.ts:396`):
  `flagNotice = {text: "A DLA FADE", flag: "A", name, team, at}`.
- **(g) Other fields:** `lastSwitchAt`, `mapId` (at `Game.ts:224`), `ScoreRow.health` (at
  `Game.ts:635`), and `lateJoin` (dead in a round mode with no `S2C.Kill` seen since the last spawn).
- **(h) Spectating.**
  - `spectate.ts` is pure. It picks alive teammates first, then alive enemies once my team is dead. It
    skips disconnected players, and in turniej it picks only the members of the current pair.
  - When the target dies it holds 1000 ms, then moves to the next. With no target it returns null and
    the bar reads „NIKOGO DO OBSERWOWANIA”.
  - While dead, LPM and PPM move to the next and previous target, and no fire input is sent.
  - The camera sits at the eye of the target `RemotePlayer` (x, y + eye, z, yaw, pitch;
    `RemotePlayer.ts:77`), smoothed. The spectated body is hidden through a new
    `RemotePlayer.setHidden`.
- **(i) Death cam.** `deathCam.ts` is pure.
  - It drops the eye 0.9 m over 400 ms and turns to the killer over 600 ms, with the direction as in
    `view/index.ts:192-197`.
  - It is applied in `LocalPlayer.ts:190-191` only while dead, and restored **exactly** at spawn.
  - There is no roll, FOV change, chase cam or outline (veto).
- **(j) The card.** `DeathCard.tsx` and `deathText.ts` render §5.2 rows 32–38 and 40.
  - The card appears at +300 ms and collapses into the spectate bar at +5300 ms in round modes.
  - Late join shows the bar only.
  - The card is hidden when `model.moment` ∈ {break, halftime, betweenPairs, ended}.
  - `death.css` draws the red radial vignette as a `veil`, with no `backdrop-filter`.
  - The card and bar sit at `--hud-card-*` and are removed from `text-transform`.
- **(k) Error codes:** `Game.ts:247` throws `ERR.sceneTimeout`, `:427` leaves with
  `ERR.connectionLost`, `:428` leaves with `ERR.connectionError` (the server message goes to
  `console.warn` only), and `:842` throws `ERR.deployTimeout`.
- **(l) `multiplayer.spec.ts`:**
  - `:544` becomes a store assertion, as in the graft (**not** a DOM read, per the veto):
    `flagNotice.flag === "A"` and `flagNotice.team === teamA`, from `window.__fb.hud.get()`. The type at
    `:22` gains `flag` and `team`.
  - The poll at `:165` goes from 10000 to 12000 ms, with a comment naming `BOMB.breakMs`.
  - The phantom `getByTestId("prep")` at `:282` becomes `getByTestId("round-end")` with `toHaveCount(0)`.
  - Nothing else changes.
- **(m) `veil-cost.mjs`**, driven through **real states**, not forced attributes:
  - two clients in a duel room with bots at 0 and `FB_DEV_TOOLS=1`;
  - it measures the `requestAnimationFrame` frame time over 5 s at the default quality, for:
    - **alive**;
    - **dead**, through the kill sequence of `multiplayer.spec.ts:230-267` (teleport, `lookAt`, burst);
    - **pause**, through `Escape` plus `document.exitPointerLock()`;
    - **result stage B**, through `dev:endmatch` (`TdmRoom.ts:405`), measured from 3.2 s to 5.8 s of
      Ended.
  - Output goes to `apps/client/e2e/out/u/p1/veil-cost.md`.

**ACCEPTANCE:**
- `hudFeed.test.ts`, by name:
  - "duel break: buy window 0";
  - "duel buy tail counts 5000→0 after release";
  - "turniej buys like the duel";
  - "respawn deadline uses respawnDelayMs: gungame 3000 / fade 2200 / tdm 3200 / ostrzyżeni survivor next
    round";
  - "mvp: defuser on BOMB DEFUSED, planter on DETONATED, most kills otherwise, none outside bomb";
  - "mvp null when the round start was not observed";
  - "siteHere true inside BOMB.useRadius of A";
  - "flagNotice carries flag, name and team";
  - "lateJoin when dead in a round mode with no kill seen".
- `spectate.test.ts`: "cycles alive teammates only", "skips disconnected", "falls back to enemies when
  the team is dead", "turniej spectates only the pair", "target death → next target after 1000 ms", "no
  target → null".
- `deathCam.test.ts`: "faces the killer within 1° after 600 ms", "eye drop reaches 0.9 m at 400 ms",
  "spawn restores the pose exactly".
- `deathText.test.ts`:
  - "round card static words ≤ 3 × 5.0 s";
  - "respawn card static words ≤ 3 × (2.2 − 0.3) s";
  - "the damage row reads ZADANE n (h) · OTRZYMANE n (h)";
  - "tournament waiting never says WYELIMINOWANY";
  - "self kill reads ZGINĄŁEŚ";
  - "late join reads DOŁĄCZYSZ W NASTĘPNEJ RUNDZIE".
- `git diff --stat` lists none of `LocalPlayer.test.ts`, `prediction.test.ts` and
  `RemotePlayer.test.ts`, and all three are green.
- New e2e `hudfeed.spec.ts` (two browsers, `FB_DEV_TOOLS=1`):
  - in a duel break `hud.buyWindowLeft === 0`, and after the release `0 < buyWindowLeft ≤ 5000`;
  - after a kill `hud.killer.hp` equals the killer's server health, and the respawn deadline equals the
    server delay ± 150 ms;
  - **spectate**: in a duel the dead player's `hud.spectating.id` equals the other player's id within
    5800 ms, and the camera's world position is within 0.3 m of that player's eye;
  - PNGs go to `apps/client/e2e/out/u/p1/`.
- `multiplayer.spec.ts` 13/13 with exactly the three edits above.
- G3 over zones `death` and `veil`:
  - budgets: `dead-next-round` death ≤ 16, `dead-spectate` bar ≤ 12, `dead-respawn` death ≤ 9;
  - `caseText` „xXPiotrekXx” in `dead-next-round`;
  - `absent [data-testid=death]` in `bomb-round-lost` and `dead-in-break`.
- In `dead-respawn`, the mean luminance of the centre 400×400 is ≥ 70 % of the same area in `tdm-live`;
  today it is about 45 % under the `.55` black. The pixel measurement goes in the report.
- `veil-cost.md`: the dead row ≥ 95 % of alive. The pause and result-B rows are reported, and they gate
  at the final gate after P6 and P7 merge.
- G1–G7.

**PROVING SCENARIOS:** `dead-next-round`, `dead-spectate`, `dead-respawn`, `dead-selfkill`,
`dead-in-break`, `late-join-spectate`, `turniej-waiting`, `infection-converted`, `bomb-round-lost`.

---

### P2-top: the CS2 top strip, mode line, flags, action slot, pair card and phase model

**OWNS:**
- `apps/client/src/ui/hud/TopStrip.tsx` (s), `apps/client/src/ui/hud/TopStrip.test.ts`
- `apps/client/src/ui/hud/ModeLine.tsx` (s), `apps/client/src/ui/hud/FlagRow.tsx` (s)
- `apps/client/src/ui/hud/BracketHud.tsx` (s), `apps/client/src/ui/hud/ActionPrompt.tsx` (s)
- `apps/client/src/ui/hud/phase.ts` (s), `apps/client/src/ui/hud/phase.test.ts` (s)
- `apps/client/src/ui/hud/top.css` (s)
- `apps/client/src/ui/Bracket.tsx`, `apps/client/src/ui/bracketView.test.ts`
- `apps/client/src/gallery/top.ts` (s)

**MUST NOT TOUCH:**
- `Hud.tsx`, `hud.css`, any other package's CSS or components, and `game/*`.
- `phase.ts` behaviour may change only with a new named test, and its exported signatures never.

**WORK:**
1. **TopStrip**, per §4 and Principle 9.
   - Sides:
     - Each side shows a name at t1 in the team colour and a score at t3. My side is on the **left by
       CSS `order`** (`stripSides`), with a filled chip and a 2 px underline.
     - FFA: „TY {kills}” on the left, the best other player on the right. Gungame: `ladder` as today.
   - Pips (round modes only):
     - 8×14 with a 3 px gap: filled when alive, a 30 % outline when dead, none when disconnected. Above
       5 per side, one pip and a count.
     - Turniej bystanders are excluded.
     - The testids `alive-a` and `alive-b` carry the count in `aria-label` and `data-count`, **never as
       text**.
   - Role: a sword or shield icon. Next to mine, the t1 badge `role-badge` (ATAK, OBRONA, OCALONY,
     OSTRZYŻONY) shows during the freeze and the first 5 s live (graft from design B).
   - Clock:
     - It follows `clockKind` and `clockMs` with the colours of Principle 8.
     - When planted: the **icon plus red fuse digits** by default (graft and veto), `data-kind=bomb`,
       1 Hz, then 2 Hz under `BOMB.defuseMs`.
     - It pulses in the last 3 s of a freeze.
   - Row 2:
     - „RUNDA 5 / 12” (`round-label`); „RUNDA 2 · DO 6”; „DO 40” (`score-goal`, now in every mode with a
       goal); „GRACZE 1/2” (`warmup-players`);
     - in turniej, `bracketStage()` (`bracket-strip`), and „DRABINKA” between pairs;
     - in ostrzyżeni, the full-width `infection-line` „RUNDA n / 5 · N NIEOSTRZYŻONYCH”, without the
       clock.
   - In gungame, `ladder` holds exactly `${rung+1}/${n}`. Nicks keep their case.
   - After a match ends, the strip shows in stage A only.
   - Kept: `.top-bar[data-mode]`, `score-a`, `score-b`, `timer`, `ladder` and `ladder-gun`.
2. **ModeLine**, ≤ 6 words, at `top-line`.
   - The testid follows the mode: `objective` in warm-up and countdown; `bomb-hud` in bomb (§5.3);
     `duel-line` in duel and turniej (match point only); `mode-line` in ostrzyżeni and TDM prep.
   - It is hidden when I am dead, in a break, between pairs and in Ended.
3. **FlagRow**: badges only. The notice belongs to P5.
4. **ActionPrompt** at y 60 %, per §5.2 rows 8, 11, 15 and 16 (testid `capture`). While
   `uiFlags.bannerUp` is set it shows only my own progress bar.
5. **Bracket.**
   - `Bracket.tsx` gets `bracketStage()`, which returns „PÓŁFINAŁ” or „FINAŁ”.
   - It also gets `pairCard(bracket, myName, roundResult)`, which is pure and returns the §5.2 row 30/31
     copy. The verdict comes from `matches[at − 1]`; a walkover has no scores.
   - `BracketPanel`, `standing` and `pairNames` stay frozen.
   - `BracketHud` shows the card (zone `bracket`) only when `moment = betweenPairs`.
6. Remove `text-transform` from `top.css`.

**ACCEPTANCE:**
- `phase.test.ts`, by name:
  - "duel/turniej clock is the round clock, never DUEL.matchMs";
  - "ostrzyżeni clock is the round clock, never the backstop";
  - "bomb Prep shows the freeze, not 30:00";
  - "planted → clockKind bomb with bomb.endsAt";
  - "urgent: round ≤ 10 s, match ≤ 30 s";
  - "break from the observed Playing→Prep edge";
  - "break fallback after a rejoin: bomb resolved / duel Prep with result";
  - "duel freeze with an empty result is not a break";
  - "round number: bomb current vs duel finished+1, finished in the break";
  - "matchPoint 5:5 duel = both";
  - "halftime is the break after BOMB.halfRounds";
  - "betweenPairs when the pair is decided";
  - "betweenPairs after a walkover in the freeze (bracket at moved, scores below DUEL.wins)";
  - "betweenPairs fallback: nobody alive and not TRADE";
  - "endedStage A/B/C at 0/3000/6000 (round) and B/C at 0/3000 (continuous)";
  - "turniej is treated as duel".
- `TopStrip.test.ts`:
  - "stripSides puts my team left, score-a stays team 0";
  - "ffa: me left, best other right";
  - "pips: alive / dead / disconnected / >5 collapses";
  - "alive counts live in aria-label and data-count, never in text";
  - "turniej bystanders have no pip".
- `bracketView.test.ts` ✓ (PÓŁFINAŁ / vs / FINAŁ), plus "bracketStage names the round without the
  pair", "pairCard ≤ 18 words for every fixture" and "walkover eyebrow".
- G3 over zones `top`, `top-line`, `action` and `bracket`:
  - the budgets of §5.1;
  - own pairs `top` × `top-line` ≥ 8 and `bracket` × `top` ≥ 16;
  - pin `leftOf [data-testid=score-b] [data-testid=score-a]` in `bomb-planted-defender`.
- `.top-bar` height 56 ± 2 px, measured with `boundingBox` at 1024×576, 1280×720 and 1600×900. The
  numbers go in the report and the PNGs to `apps/client/e2e/out/u/p2/`.
- These e2e lines are relied on and **unchanged**: `multiplayer.spec.ts:151` („ŁADUNEK NA A”), `:535`
  („PRZEJMUJESZ A”), `:772`, `:818`, `:832`, and `:1027`, `:1029`, `:1079` (`infection-line`).
- G1–G7.

**PROVING SCENARIOS:** `warmup`, `tdm-live`, `tdm-wave-prep`, `ffa-live`, `dom-live-capturing`,
`boys-live`, `bomb-live-carrier`, `bomb-live-defender`, `bomb-live-escort`, `bomb-dropped`,
`bomb-planted-defender`, `bomb-defusing`, `bomb-teammate-defusing`, `duel-freeze`, `duel-live-buytail`,
`duel-match-point`, `infection-prep`, `gungame-live`, `turniej-freeze`, `turniej-between-pairs`,
`turniej-walkover`.

---

### P3-left: the CS2 left column (radar, money, cart, plan, chat, hints)

**OWNS:**
- `apps/client/src/ui/hud/LeftColumn.tsx` (s), `apps/client/src/ui/hud/Wallet.tsx` (s)
- `apps/client/src/ui/hud/walletToasts.ts`, `apps/client/src/ui/hud/walletToasts.test.ts`
- `apps/client/src/ui/hud/left.css` (s)
- `apps/client/src/ui/Minimap.tsx`, `apps/client/src/ui/minimapGeometry.ts`,
  `apps/client/src/ui/minimapGeometry.test.ts`
- `apps/client/src/ui/PlanPanel.tsx`, `apps/client/src/ui/Chat.tsx`, `apps/client/src/ui/Hints.tsx`
- `apps/client/src/ui/hintRules.ts`, `apps/client/src/ui/hintRules.test.ts`
- `apps/client/src/gallery/left.ts` (s)

**MUST NOT TOUCH:** `Hud.tsx`, `hud.css`, `uiFit.tsx` (P0), other packages' files, `plans.ts` (P-SRV)
and `game/*`.

**WORK:**
1. **LeftColumn** as a flex column with gaps 12 / 6 / 10. It has no `data-zone`; radar, wallet and plan
   are separate roots.
   - The radar is `--hud-radar`. The 240×20 compass strip is **removed** (`Minimap.tsx:170`,
     `minimapGeometry.ts:22-23`).
   - „N” is drawn on the rim. Objectives beyond `MINIMAP.range` are 14 px letters on the rim, placed with
     a new pure `rimPin()` (graft from design C).
   - All canvas text is ≥ 14 px; today it is 10–13 px (`Minimap.tsx:87,104,131,144`). When
     `window.__canvasText` is an array, every `fillText` pushes `{text, px}` to it.
   - The area off the map is plate at 60 %.
   - A planted bomb shows as a bomb icon at its site. A dropped bomb shows as an icon at its spot, for
     attackers only (§5.3).
2. **Wallet**:
   - Money at t3 in `--hud-money`, **visible while dead**.
   - One merged „+$N” toast (changes within 2500 ms, through the pure `mergeToasts`), with no reason
     word.
   - The buy row: an SVG cart, [B] and „12s” (`buy-prompt`, `buy-countdown`). There is no countdown when
     the window is Infinity, and it is warn amber at ≤ 5 s.
   - When closed: a crossed cart plus „SKLEP ZAMKNIĘTY” for 1800 ms (`shop-closed`), or „BEZ SKLEPU W
     TYM TRYBIE”. On the shop's automatic close, the crossed cart shows for 600 ms.
   - In Boys, the words „B: rola / sklep” go; the class moves to P4's vitals header.
3. **PlanPanel** in Polish:
   - Headers: „PLAN RUNDY · 12s” and „ATAK WYBIERA PLAN · 12s”.
   - Rows: „[F1] {NAZWA} · N”.
   - Gain and cost only on the option I voted for, or the leading one.
   - During the live round: the chip „PLAN: {NAZWA}” (`plan-active`).
   - It waits while `uiFlags.bannerUp` is set. While the shop is open it is hidden but mounted, so F1 and
     F2 stay live.
   - At height ≤ 600: header and option rows only.
   - Kept: `plan-vote`, `plan-option-N` and `.plan`.
4. **Chat**: tags „[DRUŻYNA]” and „[WSZYSCY]”, placeholder „Napisz… Enter wysyła, Esc zamyka”, t1.
   Width and line caps follow §4.2.
5. **Hints**: bottom 24, 2 lines, no ellipsis (removed from `styles.css:711-715`), t1. The bomb hints
   that repeat the action slot go (`hintRules.ts:30-31`).
6. Apply the §4.5 rows for `radar`, `wallet`, `plan`, `chat` and `hint`, and remove `text-transform`
   from `left.css`.

**ACCEPTANCE:**
- `walletToasts.test.ts`: "changes within 2500 ms merge into one +$N", "reset and buy never toast", "a
  toast is 1 word".
- `minimapGeometry.test.ts` ✓ without `compassWidth`, plus "rimPin puts an off-range site on the rim".
- `hintRules.test.ts` ✓ (under 78 characters, at least 6000 ms).
- G3 over zones `radar`, `wallet`, `plan`, `chat` and `hint`:
  - `bomb-freeze`: `wallet` + `plan` ≤ 28 words (132 in total today);
  - `chat-busy`: own pairs `chat` × `wallet`, `plan` × `chat`, `plan` × `wallet`, `wallet` × `radar`
    and `hint` × `chat` pass at 3 sizes;
  - `radar-rim-pins`: `canvasMin ≥ 14`;
  - `dead-next-round`: `[data-zone=wallet]` is visible;
  - `shop-closed-flash`: wallet ≤ 5 words, and the text „BEZ SKLEPU W TYM TRYBIE” in the no-shop
    variant.
- No English in the `plan` and `chat` zones: `grep -iE 'vote|your|costs|force|team|all\b|say'` over
  their innerText in `bomb-freeze` and `chat-busy` finds 0 matches.
- e2e `startup.spec.ts:52` (`buy-countdown` /\d+s/), `multiplayer.spec.ts:349` (`buy-prompt`), `:606`
  (`minimap`) and `:612-616` (chat) pass unchanged.
- `ui-fit.mjs` finds `.plan` in P0's `.hud`-wrapped harness and passes.
- G1–G7.

**PROVING SCENARIOS:** `bomb-freeze`, `shop-closed-flash`, `chat-busy`, `radar-rim-pins`, `bomb-dropped`,
`warmup`, `tdm-live`, `duel-live-buytail`, `dead-next-round`.

---

### P4-corners: the bottom corners and the top right (health, perks, ammo, grenades, C4, kill feed, crosshair)

**OWNS:**
- `apps/client/src/ui/hud/Vitals.tsx` (s), `apps/client/src/ui/hud/Inventory.tsx` (s)
- `apps/client/src/ui/hud/KillFeed.tsx` (s), `apps/client/src/ui/hud/Crosshair.tsx` (s)
- `apps/client/src/ui/hud/icons.tsx` (s)
- `apps/client/src/ui/hud/corners.css` (s)
- `apps/client/src/gallery/corners.ts` (s)

**MUST NOT TOUCH:** `Hud.tsx`, `hud.css`, `Scoreboard.tsx` and `shopArt.tsx` (read them only), and
`game/*`.

**WORK:**
1. **Vitals**, a 300×64 plate:
   - Health: a cross icon, the value at t4 and a 132×4 bar.
   - Armour: a plate icon and the value at t3. The testid `armor` contains the number, e.g. „50”. Broken
     armour is an icon with no word.
   - In Boys, a t1 header with the class („Assault” or „Assault → Medic”).
   - Perks: 36×36 chips, each a glyph with a conic time ring and seconds at t1 in the last 5 s only.
     - The perk name is `sr-only` at 14 px, uppercased in JS („FLASZKA”).
     - The steroids gate is a grey ring.
     - The spawn shield is a bubble icon (`IconBubble`), not the armour plate.
2. **Inventory**:
   - The magazine at t4 and „/ 90” at t2 (so `inv` ≤ 2 words).
   - During a reload the digits stay: the magazine dims to 40 % and a 3 px bar shows. The plate width
     stays constant. A magazine at ≤ 25 % is warn, at 0 danger.
   - The weapon is drawn with `SHOP_ART`, falling back to the short name.
   - Zone `weapon`: the name at t1 for 1500 ms after `lastSwitchAt` (`weapon-name`).
   - Zone `gear`: only the grenades I hold, with ×N and a 13 px keycap. Empty slots are `display:none`,
     but `slot-lethal` and `slot-tactical` stay in the DOM. The C4 icon with [T] (`c4`) blinks when
     `siteHere` is set.
   - For a melee weapon, `ammo` contains „∞”.
3. **KillFeed** at width `--hud-feed-w`:
   - At most 5 rows, always with a row background.
   - The weapon silhouette plus `HeadShot` / `Razor` (read-only from `Scoreboard.tsx`).
   - 1 px brass when I am the killer, 1 px red when I am the victim.
   - Nicks keep their case.
4. **Crosshair**: the breath hint at 14 px with the bar under it. The veils (smoke, flash, damage
   direction, scope) are siblings with `data-zone=veil`, outside the `crosshair` zone.
5. Apply the §4.5 rows for `vitals`, `perks`, `inv`, `gear`, `weapon`, `feed` and `crosshair`, and
   remove `text-transform` from `corners.css` (`.weapon-name`, `styles.css:153`).
6. `icons.tsx`: the drawings may be refined, but not the names or props.

**ACCEPTANCE:**
- G3 over zones `vitals`, `perks`, `inv`, `gear`, `weapon`, `feed`, `crosshair` and `veil`:
  - `low-health-reloading`: `inv` ≤ 2, with „0” and the reserve present, and zone `textAbsent`
    „PRZEŁADOWANIE” and „ZNISZCZONA”;
  - `scoped`: `crosshair` ≤ 3 words at 14 px;
  - `weapon-switch`: `weapon` ≤ 3;
  - `gungame-live`: `gear` has 0 visible slots;
  - `tdm-live`: `feed` ≤ 3 words per row;
  - `boys-live`: `vitals` ≤ 4;
  - `invisible` for vitals, inv, gear and crosshair in `dead-next-round`;
  - own pairs `vitals` × `perks`, `inv` × `gear` and `gear` × `weapon` ≥ 8.
- The ammo plate width is identical (± 1 px) with and without a reload, measured with `boundingBox` and
  reported. Today it jumps from about 130 to about 240 px.
- The feed width at 1024×576 is ≤ 195.5 px (the `--hud-feed-w` token). The `feed` × `top` pair is
  reported here and gated at the final gate.
- e2e passes unchanged: `multiplayer.spec.ts:458` (ammo contains „∞”), `:464` (armor contains „50”),
  `:465` (perks contains „FLASZKA”), `:490` (crosshair count 0 when scoped), `:129` (smoke-screen),
  `:400` (cook), `:425` (flash), `:565` (tac). PNGs go to `apps/client/e2e/out/u/p4/`.
- G1–G7.

**PROVING SCENARIOS:** `low-health-reloading`, `scoped`, `weapon-switch`, `tdm-live`, `gungame-live`,
`boys-live`, `bomb-live-carrier`, `dead-next-round`.

---

### P5-moments: intro, fight, round start, plant, round end, halftime, final round, alerts and phase sounds

**OWNS:**
- `apps/client/src/ui/hud/Moments.tsx` (s), `apps/client/src/ui/hud/RoundBanner.tsx` (s)
- `apps/client/src/ui/hud/Moments.test.ts`
- `apps/client/src/ui/hud/bus.ts`, `apps/client/src/ui/hud/bus.test.ts`
- `apps/client/src/ui/hud/roundText.ts` (s), `apps/client/src/ui/hud/roundText.test.ts` (s)
- `apps/client/src/ui/hud/moments.css` (s)
- `apps/client/src/game/audio/index.ts`, `apps/client/src/game/audio/sfx.ts`
- `apps/client/src/game/audio/beeps.ts`, `apps/client/src/game/audio/beeps.test.ts`
- `apps/client/src/gallery/moments.ts` (s)

**MUST NOT TOUCH:**
- `Hud.tsx`, `hud.css`, `uiFit.tsx` (P0), `Game.ts` and `game/events.ts`. Sound cues come from
  `hud.subscribe` and the existing `matchPhase` event; no new game events.
- `MatchResult.tsx` and `resultText.ts` (P6).

**WORK:**
1. **The bus.** `bus.ts` is a pure arbiter over the phase model and timestamped observations (§6.5).
   - Its inputs: the plant edge, `flagNotice`, a gungame rung reaching the last weapon, `KillEvent.shave`
     with me as the victim, the Countdown→Waiting edge, the Ended→Waiting edge, the Countdown→Playing
     edge and `reconnecting`.
   - It publishes `uiFlags.bannerUp`.
2. **The Banner and Alert components**, per §3.7 and §4.2. Every banner has the three rows. The band is
   a `veil`, and the content box is `banner`. The flag notice renders in the alert slot with testid
   `flag-notice`.
3. **Moments**:
   - the intro block (zone `intro`) and the digit during Countdown, with the 4000 ms kept;
   - „WALCZ!” in continuous modes only;
   - the freeze-start banner (the eyebrow from `phase.ts`; in turniej the stage and „Kowal vs RYSIEK” in
     round 1 of a pair), and the ostrzyżeni role card in its place;
   - the alerts: ŁADUNEK PODŁOŻONY, OSTATNIA BROŃ, ODLICZANIE PRZERWANE, NOWY MECZ, and UTRACONO
     POŁĄCZENIE (`reconnecting`, z `--z-reconnect`);
   - the „OSTRZYŻONY!” banner.
4. **RoundBanner** (`round-end`, classes `mine` / `theirs` / `even` / `watch`):
   - the eyebrow WYGRANA, PRZEGRANA or REMIS, plus the ZMIANA STRON chip in duel and turniej;
   - the title „RUNDA DLA {TEAM}”, which `multiplayer.spec.ts:160` pins;
   - one line: `roundReasonShort` (§5.4), plus „MVP {nick} · {podłożenie | rozbrojenie | n zabójstwa}”
     (`round-mvp`) in bomb, or the `round-end-carry` span „Broń zostaje” / „Broń przepada” in duel and
     turniej;
   - **no score and no countdown**;
   - the halftime cross-fade at 7000 ms;
   - the stage-A banner;
   - turniej handled as duel (today `roundEnd` returns null, `resultText.ts:143`);
   - `standalone` for `uiFit.tsx`.

   `roundText.ts` adds `roundReasonShort` and the entries 'SURVIVORS HELD' and 'ALL SHAVED'. It reads
   `bomb.result` in ostrzyżeni and falls back to `roundWinner` when that is empty.
5. **Audio**:
   - `beeps.ts` is a pure schedule: `beepTimes(phase, prevPhase, endsAt, now)` and
     `bombBeepInterval(fuseLeft)`, a linear interpolation from 1000 to 150 ms.
   - `index.ts` uses them in place of `MATCH.prepMs` and the hard-coded 1/2/3 (`:217-231`).
   - `sfx`: a round win or loss stinger, and the bomb beep (today `grep planted game/audio` finds 0).
6. Remove `text-transform` from `moments.css`.

**ACCEPTANCE:**
- `bus.test.ts`: 1000 seeded push sequences (mulberry32, seeds 1–1000). There are never 2 banners or 2
  alerts; while a banner is up, the alert is null or reconnect and the action mode is `progressOnly`; no
  item shows outside its window.
- `Moments.test.ts` walks each mode's full sequence in 100 ms steps: tdm; bomb for 12 rounds, including
  6 and 7; duel to 6:5; ostrzyżeni for 5; turniej with 2 pairs and a walkover. At every step there is at
  most one banner **or** pair card, and at most one alert. **Every item's timed words are ≤ 3 × the
  seconds visible** (§6.5).
- `roundText.test.ts`:
  - the moved assertions from `resultText.test.ts:65-84`, unchanged;
  - "turniej round end names the winner";
  - "SURVIVORS HELD / ALL SHAVED are Polish";
  - "every short reason ≤ 3 words and BOMB DEFUSED short is 'Ładunek rozbrojony'";
  - "halftime card after BOMB.halfRounds".
- `beeps.test.ts`: "freeze beeps at endsAt−3000/−2000/−1000", "countdown beeps from phaseEndsAt", "no
  beeps in a break", "bomb beep 1000 ms at plant → 150 ms at 0".
- G3 over zones `banner`, `alert`, `intro` and `veil`:
  - banner ≤ 12, alert ≤ 6 and intro ≤ 8 in every proving scenario;
  - zone `textAbsent` „następna runda za” and the score in `banner` in every break scenario.
- The `banner` × `crosshair`, `banner` × `feed` and `intro` × `crosshair` pairs are reported here and
  gated at the final gate.
- `animMaxMs ≤ 600` for the own zones, and `anims = 0` under reduced motion.
- e2e `multiplayer.spec.ts:160-163` („RUNDA DLA TAPER”, „Ładunek rozbrojony”, `mine` / `theirs`)
  passes **unchanged**. `ui-fit.mjs` finds `.round-end` in P0's standalone mount. PNGs go to
  `apps/client/e2e/out/u/p5/`.
- G1–G7.

**PROVING SCENARIOS:** `countdown`, `countdown-aborted`, `fight-start`, `round-freeze-start`,
`bomb-planted-alert`, `bomb-round-won`, `bomb-round-lost`, `bomb-halftime`, `bomb-halftime-break`,
`duel-round-break`, `turniej-round-break`, `match-end-final-round`, `gungame-last-weapon`,
`new-match-warmup`, `reconnecting`, `break-rejoin`, `infection-prep`, `infection-converted`,
`dead-in-break`.

---

### P6-end: the match result in three stages, and a CS2 Tab scoreboard

**OWNS:**
- `apps/client/src/ui/MatchResult.tsx` (s)
- `apps/client/src/ui/resultText.ts` (s), `apps/client/src/ui/resultText.test.ts` (s)
- `apps/client/src/ui/Scoreboard.tsx`
- `apps/client/src/ui/hud/ScoreboardOverlay.tsx` (s), `apps/client/src/ui/hud/ResultLayer.tsx` (s)
- `apps/client/src/ui/hud/result.css` (s)
- `apps/client/src/gallery/end.ts` (s)

**MUST NOT TOUCH:** `Hud.tsx`, `hud.css`, `uiFit.tsx` (P0), `Bracket.tsx` and `roundText.ts` (read
only), and `multiplayer.spec.ts` (P1).

**WORK:**
1. **The result.** `ResultLayer` mounts `MatchResult` from t = 0 of Ended with every testid: `result`
   (`data-outcome`, `data-stage`), `result-title`, `result-score`, `result-why`, `result-stats`,
   `summary`, `summary-total`, `summary-level`, `result-countdown`, `result-leave` and the tabs.
   - Stages come from `endedStage` and hide **by opacity only** (§4.5).
   - The pure `resultStage(endedStage, skipped)` jumps to C on a Tab press or a tab click (graft).
   - On Ended → Waiting it stays mounted 400 ms through `useKeepMounted`, with its listeners off.
2. **Stage B**:
   - the verdict at t5 in the result colour (PORAŻKA in danger red; `styles.css:217` makes it grey
     today);
   - `scoreLine` (keeping „FADE 40 — 31 TAPER”, veto);
   - the short why `result-verdict-why` (≤ 3 words): `roundReasonShort(roundResult)` in round modes,
     otherwise „Limit zabójstw”, „Wynik po czasie”, „Cała drabinka” or „Finał drabinki”.
3. **Stage C**, ≤ 42 words in round modes and ≤ 48 in continuous modes:
   - title and score; `result-why`: in round modes `${roundReasonShort} w ostatniej rundzie` (graft),
     falling back to `matchWhy` when `roundResult` is empty. TDM on time reads „Wyższy wynik po
     czasie”. Ostrzyżeni no longer prints the score twice (`resultText.ts:48` against `:67-68`);
   - the tabs PODSUMOWANIE, TABELA (and DRABINKA). The [TAB] keycap goes; Tab still works;
   - a podium of the top 3 from `h.players` (points in team modes, kills in ffa, rung in gungame), with ★
     at #1. In ffa and gungame the score line is omitted and „MIEJSCE #n Z m” (`placement`) shows when I
     am outside the top 3;
   - 3 stats: the objective stat first, then K, A and D in that order. This changes
     `resultText.test.ts:48`, with the reason written in the commit;
   - „+{n} XP · POZIOM {l}” with the bar, and „NAJGORSZA FRYZURA: {nick} ×{n}”;
   - SZCZEGÓŁY (the next goal and the badges);
   - the footer „ROZGRZEWKA ZA {n}s” (the real time to the warm-up; there is no false "sam startuje")
     and „WYJDŹ DO MENU”.
4. **The scoreboard**:
   - The header `sb-header` uses `MODE_TITLE` (also for the FFA header at `Scoreboard.tsx:83`) and the
     map name.
   - The history strip `sb-history` is filled from `hud.roundHistory`. Rounds that were not observed are
     empty slots; nothing is invented.
   - My team first, then the enemy, stacked (`.sb-team` stays). Columns K A D ✂ $ PKT PING, with `$` for
     my team only (fixes `Scoreboard.tsx:62`).
   - Dead players at 50 % with a skull. Rows at t1 Inter with tabular numerals.
   - In turniej, the pair's rows and then `BracketPanel`.
   - `Razor` and `HeadShot` stay frozen.
5. **ScoreboardOverlay**: Tab works while the shop is open, above it (z 45). It sets
   `uiFlags.overlay.tab`. The board's top is `max(10vh, 88px)`.
6. Apply the §4.5 rows for `scoreboard` and `result`, and remove `text-transform` from `result.css`.

**ACCEPTANCE:**
- `resultText.test.ts` ✓.
  - Kept: „ZWYCIĘSTWO” / „PORAŻKA”, „drabinkę N broni”, „FADE 40 — 31 TAPER”.
  - New: "stat order is objective, then K/A/D in every mode", "podium ranks by score / kills / rung",
    "placement line only outside the top 3", "round-mode why names the deciding round".
  - New: "stage B verdict ≤ 9 words for every outcome × reason" (§6.5), "stage C words ≤ 3 × 14 s in
    round modes and ≤ 3 × 17 s in continuous modes", "resultStage jumps to C on Tab or a tab click".
- `useKeepMounted` is used by `ResultLayer`. The gallery pin in `new-match-warmup` checks that `result`
  is present at +200 ms and gone at +600 ms.
- G3 over zones `scoreboard` and `result`:
  - `match-end-verdict` result ≤ 8, `match-end-win` and `match-end-loss` ≤ 42, `match-end-ffa` ≤ 48,
    `match-end-turniej` ≤ 44;
  - `scoreboard` ≤ 110 and `scoreboard-bomb-history` board ≤ 110;
  - in `scoreboard-bomb-history` the board is above the shop (z 45 > 40, measured with
    `elementFromPoint`).
  - Today: 63 / 61 / — / 115 words, with text down to 10 px.
- e2e passes **unchanged**: `multiplayer.spec.ts:660-667` (summary visible right after Ended),
  `:871-874` (result-title exact, why, stats „14 / 14”), `:603-604` and `:777` (scoreboard).
- `ui-fit.mjs` passes on 8 sizes for `.result-card`, `.result-title`, `.result-score`, `.result-why` and
  `td.sb-name`. PNGs go to `apps/client/e2e/out/u/p6/`.
- G1–G7.

**PROVING SCENARIOS:** `match-end-verdict`, `match-end-win`, `match-end-loss`, `match-end-ffa`,
`match-end-turniej`, `scoreboard`, `scoreboard-bomb-history`, `scoreboard-turniej`,
`match-end-final-round`.

---

### P7-screens: transitions through black, loading, errors, the ESC column and the five-aisle shop

**OWNS:**
- `apps/client/src/App.tsx`, `apps/client/src/ui/Fade.tsx`, `apps/client/src/ui/Loading.tsx`
- `apps/client/src/ui/errors.ts`, `apps/client/src/ui/errors.test.ts`
- `apps/client/src/ui/hud/PauseMenu.tsx` (s), `apps/client/src/ui/hud/ShopLayer.tsx` (s)
- `apps/client/src/ui/TeamPicker.tsx`
- `apps/client/src/ui/Shop.tsx`, `apps/client/src/ui/shopCatalog.ts`,
  `apps/client/src/ui/shopCatalog.test.ts`, `apps/client/src/ui/shopArt.tsx`
- `apps/client/src/ui/hud/screens.css` (s)
- `apps/client/e2e/tools/ui-fit.mjs`, `apps/client/e2e/tools/cycles.mjs`,
  `apps/client/e2e/tools/cycle-leaks.mjs`
- `apps/client/e2e/startup.spec.ts`
- `apps/client/src/gallery/screens.ts` (s)

**MUST NOT TOUCH:** `Hud.tsx`, `hud.css`, `uiFit.tsx` (P0), `cinematic.css` (`mm-keyart-in` stays),
`menu.css`, `Menu.tsx`, `SettingsPanel.tsx` (overridden only locally in `screens.css`), and `game/*`.

**WORK:**
1. **Fade.tsx** (testid `fade`, z 150) sits inside `.app`, so the fullscreen lock holds
   (`PLAN_2_1.md:501-507`).
   - It is driven at `App.tsx:75,84,98,124,138,193` and runs the sequences in §6.1: menu → loading,
     loading → match, match → menu, loading → menu, error → menu.
   - It passes `entering` to the Hud when the black starts to leave.
2. **Loading**, per §5.2 rows 64–65.
   - `App` passes the menu's `gameMode` and `mapId` (the `play(...)` arguments, `App.tsx:80`) as props.
     When joining by room id, both are unknown until `loadStage` reaches `players` (`Game.ts:224`), and
     the title reads „DOŁĄCZANIE DO POKOJU”.
   - The eyebrow is `mapTitle`, the title comes from `MODE_TITLE`, and the line from `modeGoal`
     (`loading-objective`).
   - One GOTOWE, the key line at 14 px, and one `.loading` definition.
   - `text-transform` is removed (`cinematic.css:209`, moved by P0).
3. **Errors.** `humanError` moves from `App.tsx:207-218` into `ui/errors.ts`. It maps codes to
   `ERROR_TEXT` and maps English network and renderer messages to codes (§5.5). The `load-timeout` code
   replaces the English string at `App.tsx:85`.
4. **PauseMenu** (`pause`), a left column 380 px wide, per rows 54–57.
   - Settings open beside it (`.settings` and `.set-body` overridden in `screens.css`, with no double
     scroll).
   - `pause-lock-refused` stays, and so do the 300 ms arming and the dormant block
     (`startup.spec.ts:16,39`).
   - After Ended → Waiting: the `resume-prompt` „KLIKNIJ, ŻEBY GRAĆ” (zone `prompt`) stays until a click
     or ESC, and automatic arming is suppressed for 2500 ms (§6.1).
5. **TeamPicker** in Polish, every string in §5.6; OCALENI / OSTRZYŻENI in ostrzyżeni; hidden in duel
   and turniej.
6. **Shop**, per rows 49–50:
   - Five columns, with the column header `shop-tab-N`; clicking it arms the aisle.
   - A tile has ≤ 6 words: key, name, price and at most one of today's tags (§8.6), unchanged. The armed
     message contains „numer z kafelka”.
   - In CS modes „+${csKillReward} ZA ZABÓJSTWO” (`CS_KILL_REWARD`, imported but unused today,
     `Shop.tsx:5`).
   - No „Okno po odrodzeniu” in bomb or duel (`Shop.tsx:333-342`).
   - The `shop-plan` strip.
   - The key handler never takes Tab.
   - `ShopLayer` keeps the mount conditional and stays mounted 160 ms on exit with its listeners off
     (`useKeepMounted`, veto).
   - One screen with no scrolling, and the Boys picker stays a strip (`PLAN_2_1.md:238-239`).
   - `SHOP_ART`'s signature is frozen.
7. **Tools**: `cycles.mjs` and `cycle-leaks.mjs` click `btn-leave`, then `btn-leave-confirm`.
8. Apply the §4.5 rows for `shop`, `pause` and `prompt`; the shop card hides under Tab.

**ACCEPTANCE:**
- `errors.test.ts`: "every code maps to its Polish text", "network, full, not-found and WebGL messages
  map to codes", "no returned text contains an English word from a 40-word list".
- G3 over zones `loading`, `pause`, `prompt` and `shop`:
  - `loading` ≤ 16 and `loading-ready` ≤ 26 (30 / 56 today, down to 9 px);
  - `pause` ≤ 20, `pause-leave-confirm` ≤ 26, `pause-teams` ≤ 46, `prompt` ≤ 4;
  - `shop-open` and `shop-open-bomb-tail` shop ≤ 130, with all five `[data-testid^=shop-tab-]` inside
    the viewport together;
  - `pause-settings`: pins `leftOf [data-testid=pause] [data-testid=settings]` and
    `noScroll .set-body`;
  - `menu-error`: text „Nie udało się wejść do meczu”, and `textAbsent` „Deployment”, „timeout”,
    „Please”.
- `grep -iE 'your|side|can.t|join|players|bots|you are|money and gear'` over the innerText of `pause`
  and `pause-teams` finds 0 matches.
- `[data-testid=pause]` is 380 ± 2 px wide with x = 0 at 1600×900 (`boundingBox` in the report).
- `node apps/client/e2e/tools/ui-fit.mjs` passes on 8 sizes (1280×720 … 1024×576): nothing cut,
  nothing scrolled, floors 16 / 13 / 10. The report goes to `apps/client/e2e/out/u/p7/shop-fit.md`.
- `shopCatalog.test.ts` ✓.
- `startup.spec.ts` ✓ in full (`:3` with the server; `:68`, `:89`, `:110`, `:141` client only), plus two
  new tests:
  - "fade on enter": `[data-testid=fade]` reaches opacity 1 and returns to 0 within 1200 ms (poll);
  - "no shared frame": an in-page `requestAnimationFrame` probe records, per frame, the fade opacity,
    whether the loading card is visible, whether the canvas host is visible and whether `.hud` is
    dormant. The test passes when **no frame** has fade < 0.99 while (loading card visible and canvas
    visible), or (canvas visible and `.hud` dormant). The probe log goes to
    `apps/client/e2e/out/u/p7/enter-probe.json`.
- `multiplayer.spec.ts:361-384` and `:468-478` pass **unchanged**: „Kupiono: Frag”, „Brakuje $1,400”,
  „numer z kafelka”, „LUNETA”, „działa jeszcze”, „nosisz”.
- `node e2e/tools/cycles.mjs` ✓ with the confirmation. `menu-fit.mjs` 5/5.
- G1–G7.

**PROVING SCENARIOS:** `shop-open`, `shop-open-bomb-tail`, `pause`, `pause-leave-confirm`,
`pause-teams`, `pause-settings`, `loading`, `loading-ready`, `menu-error`, `new-match-warmup`.

---

### 7.9 Overlap check: every file and its one owner

P0's files are frozen after P0. Files marked (s) were seeded by P0 and afterwards belong **only** to
the package named. No path appears twice. Case check: every new test file carries its module's exact
case (`TopStrip.test.ts`, `Moments.test.ts`), so `moduleNames.test.ts` stays green.

| file | package |
|---|---|
| `apps/client/src/ui/Hud.tsx` | P0 |
| `apps/client/src/ui/hud/hud.css` | P0 |
| `apps/client/src/ui/hud/index.css` | P0 |
| `apps/client/src/ui/hud/types.ts` | P0 |
| `apps/client/src/ui/hud/format.ts` | P0 |
| `apps/client/src/ui/hud/format.test.ts` | P0 |
| `apps/client/src/ui/hud/copy.ts` | P0 |
| `apps/client/src/ui/hud/copy.test.ts` | P0 |
| `apps/client/src/ui/hud/uiFlags.ts` | P0 |
| `apps/client/src/ui/hud/useKeepMounted.ts` | P0 |
| `apps/client/src/ui/hud/useKeepMounted.test.ts` | P0 |
| `apps/client/src/ui/styles.css` | P0 |
| `apps/client/src/ui/cinematic.css` | P0 |
| `apps/client/src/main.tsx` | P0 |
| `apps/client/src/uiFit.tsx` | P0 |
| `apps/client/src/hudStates.tsx` | P0 |
| `apps/client/src/gallery/index.ts` | P0 |
| `apps/client/src/gallery/fixtures.ts` | P0 |
| `apps/client/hud-states.html` | P0 |
| `apps/client/e2e/tools/hud-states.mjs` | P0 |
| `packages/shared/src/bomb.ts` | P-SRV |
| `packages/shared/src/bomb.test.ts` | P-SRV |
| `packages/shared/src/modes.ts` | P-SRV |
| `packages/shared/src/modes.test.ts` | P-SRV |
| `packages/shared/src/constants.ts` | P-SRV |
| `packages/shared/src/rounds.ts` | P-SRV |
| `packages/shared/src/rounds.test.ts` | P-SRV |
| `packages/shared/src/plans.ts` | P-SRV |
| `packages/shared/src/plans.test.ts` | P-SRV |
| `apps/server/src/rooms/TdmRoom.ts` | P-SRV |
| `apps/server/src/rooms/Bomb.test.ts` | P-SRV |
| `apps/server/src/rooms/Duel.test.ts` | P-SRV |
| `apps/server/src/rooms/DuelPersonas.test.ts` | P-SRV |
| `apps/server/src/rooms/Infection.test.ts` | P-SRV |
| `apps/server/src/rooms/Tournament.test.ts` | P-SRV |
| `apps/server/src/rooms/DropE.test.ts` | P-SRV |
| `apps/client/src/game/Game.ts` | P1 |
| `apps/client/src/game/store.ts` (s) | P1 |
| `apps/client/src/game/hudFeed.ts` | P1 |
| `apps/client/src/game/hudFeed.test.ts` | P1 |
| `apps/client/src/game/spectate.ts` | P1 |
| `apps/client/src/game/spectate.test.ts` | P1 |
| `apps/client/src/game/player/deathCam.ts` | P1 |
| `apps/client/src/game/player/deathCam.test.ts` | P1 |
| `apps/client/src/game/player/LocalPlayer.ts` | P1 |
| `apps/client/src/game/player/RemotePlayer.ts` | P1 |
| `apps/client/src/ui/hud/DeathCard.tsx` (s) | P1 |
| `apps/client/src/ui/hud/deathText.ts` | P1 |
| `apps/client/src/ui/hud/deathText.test.ts` | P1 |
| `apps/client/src/ui/hud/death.css` (s) | P1 |
| `apps/client/src/gallery/death.ts` (s) | P1 |
| `apps/client/e2e/hudfeed.spec.ts` | P1 |
| `apps/client/e2e/multiplayer.spec.ts` | P1 |
| `apps/client/e2e/tools/veil-cost.mjs` | P1 |
| `apps/client/src/ui/hud/TopStrip.tsx` (s) | P2 |
| `apps/client/src/ui/hud/TopStrip.test.ts` | P2 |
| `apps/client/src/ui/hud/ModeLine.tsx` (s) | P2 |
| `apps/client/src/ui/hud/FlagRow.tsx` (s) | P2 |
| `apps/client/src/ui/hud/BracketHud.tsx` (s) | P2 |
| `apps/client/src/ui/hud/ActionPrompt.tsx` (s) | P2 |
| `apps/client/src/ui/hud/phase.ts` (s) | P2 |
| `apps/client/src/ui/hud/phase.test.ts` (s) | P2 |
| `apps/client/src/ui/hud/top.css` (s) | P2 |
| `apps/client/src/ui/Bracket.tsx` | P2 |
| `apps/client/src/ui/bracketView.test.ts` | P2 |
| `apps/client/src/gallery/top.ts` (s) | P2 |
| `apps/client/src/ui/hud/LeftColumn.tsx` (s) | P3 |
| `apps/client/src/ui/hud/Wallet.tsx` (s) | P3 |
| `apps/client/src/ui/hud/walletToasts.ts` | P3 |
| `apps/client/src/ui/hud/walletToasts.test.ts` | P3 |
| `apps/client/src/ui/hud/left.css` (s) | P3 |
| `apps/client/src/ui/Minimap.tsx` | P3 |
| `apps/client/src/ui/minimapGeometry.ts` | P3 |
| `apps/client/src/ui/minimapGeometry.test.ts` | P3 |
| `apps/client/src/ui/PlanPanel.tsx` | P3 |
| `apps/client/src/ui/Chat.tsx` | P3 |
| `apps/client/src/ui/Hints.tsx` | P3 |
| `apps/client/src/ui/hintRules.ts` | P3 |
| `apps/client/src/ui/hintRules.test.ts` | P3 |
| `apps/client/src/gallery/left.ts` (s) | P3 |
| `apps/client/src/ui/hud/Vitals.tsx` (s) | P4 |
| `apps/client/src/ui/hud/Inventory.tsx` (s) | P4 |
| `apps/client/src/ui/hud/KillFeed.tsx` (s) | P4 |
| `apps/client/src/ui/hud/Crosshair.tsx` (s) | P4 |
| `apps/client/src/ui/hud/icons.tsx` (s) | P4 |
| `apps/client/src/ui/hud/corners.css` (s) | P4 |
| `apps/client/src/gallery/corners.ts` (s) | P4 |
| `apps/client/src/ui/hud/Moments.tsx` (s) | P5 |
| `apps/client/src/ui/hud/Moments.test.ts` | P5 |
| `apps/client/src/ui/hud/RoundBanner.tsx` (s) | P5 |
| `apps/client/src/ui/hud/bus.ts` | P5 |
| `apps/client/src/ui/hud/bus.test.ts` | P5 |
| `apps/client/src/ui/hud/roundText.ts` (s) | P5 |
| `apps/client/src/ui/hud/roundText.test.ts` (s) | P5 |
| `apps/client/src/ui/hud/moments.css` (s) | P5 |
| `apps/client/src/game/audio/index.ts` | P5 |
| `apps/client/src/game/audio/sfx.ts` | P5 |
| `apps/client/src/game/audio/beeps.ts` | P5 |
| `apps/client/src/game/audio/beeps.test.ts` | P5 |
| `apps/client/src/gallery/moments.ts` (s) | P5 |
| `apps/client/src/ui/MatchResult.tsx` (s) | P6 |
| `apps/client/src/ui/resultText.ts` (s) | P6 |
| `apps/client/src/ui/resultText.test.ts` (s) | P6 |
| `apps/client/src/ui/Scoreboard.tsx` | P6 |
| `apps/client/src/ui/hud/ScoreboardOverlay.tsx` (s) | P6 |
| `apps/client/src/ui/hud/ResultLayer.tsx` (s) | P6 |
| `apps/client/src/ui/hud/result.css` (s) | P6 |
| `apps/client/src/gallery/end.ts` (s) | P6 |
| `apps/client/src/App.tsx` | P7 |
| `apps/client/src/ui/Fade.tsx` | P7 |
| `apps/client/src/ui/Loading.tsx` | P7 |
| `apps/client/src/ui/errors.ts` | P7 |
| `apps/client/src/ui/errors.test.ts` | P7 |
| `apps/client/src/ui/hud/PauseMenu.tsx` (s) | P7 |
| `apps/client/src/ui/hud/ShopLayer.tsx` (s) | P7 |
| `apps/client/src/ui/TeamPicker.tsx` | P7 |
| `apps/client/src/ui/Shop.tsx` | P7 |
| `apps/client/src/ui/shopCatalog.ts` | P7 |
| `apps/client/src/ui/shopCatalog.test.ts` | P7 |
| `apps/client/src/ui/shopArt.tsx` | P7 |
| `apps/client/src/ui/hud/screens.css` (s) | P7 |
| `apps/client/e2e/tools/ui-fit.mjs` | P7 |
| `apps/client/e2e/tools/cycles.mjs` | P7 |
| `apps/client/e2e/tools/cycle-leaks.mjs` | P7 |
| `apps/client/e2e/startup.spec.ts` | P7 |
| `apps/client/src/gallery/screens.ts` (s) | P7 |

Nobody edits these in this drop:
- client UI: `menu.css`, `Menu.tsx`, `SettingsPanel.tsx`, `Armoury.tsx`, `hudBench.tsx`,
  `moduleNames.test.ts`;
- client game code: `game/view/*`, `game/input/*`, `game/engine.ts`, `Nameplates.ts`, `game/events.ts`;
- shared and server: `apps/server/src/schema.ts`, `packages/shared/src/{types,cs,economy,tournament,boys}.ts`,
  every other shared file not listed above, and every server test not listed above;
- e2e: `armoury.spec.ts`, and the tools `hud-bench.mjs`, `hud-diff.mjs`, `menu-fit.mjs`,
  `gora-shots.mjs` (it tolerates a missing `duel-line`, `:91`), `infection-shots.mjs` (it reads
  `infection-line`, which is kept), `hud-shot.mjs`, `hudshots.mjs` and `cs-round-check.mjs`, which are
  run read-only;
- all of `docs/*`, except that Ultron writes the ledger row at the end.

## 8 Test contract

### 8.1 e2e specs

| spec | owner | edits in this drop | lines other packages rely on, unchanged |
|---|---|---|---|
| `multiplayer.spec.ts` | P1 | `:165` poll 10000 → 12000; `:282` 'prep' → 'round-end' `toHaveCount(0)`; `:544` a store assertion on `flagNotice.flag` and `flagNotice.team` (graft; no DOM read, per the veto), with the type at `:22` extended | P2: `:151`, `:535`, `:772`, `:818`, `:832`, `:1027`, `:1029`, `:1079`. P3: `:349`, `:606`, `:612-616`. P4: `:129`, `:400`, `:425`, `:458`, `:464`, `:465`, `:490`, `:565`. P5: `:160-163`. P1: `:273`, `:283`. P6: `:603-604`, `:660-667`, `:777`, `:871-874`. P7: `:361-384`, `:468-478`. |
| `startup.spec.ts` | P7 | adds "fade on enter" and "no shared frame" | `:14-21`, `:16`, `:39`, `:46-52`, `:55-65`, `:68-80`, `:89-159` |
| `hudfeed.spec.ts` (new) | P1 | new, including spectate | – |
| `armoury.spec.ts` | nobody | – | `:74` |

### 8.2 `data-testid` kept, with the same meaning

- **Root and top**: `hud`, `debug`, `score-a`, `score-b`, `timer`, `score-goal`, `ladder` (exact
  `${rung+1}/${n}`), `ladder-gun`, `bomb-hud`, `infection-line` (still containing „RUNDA 1 / 5” and
  „1 NIEOSTRZYŻONYCH”), `duel-line`, `objective`, `flags`, `flag-A`, `flag-B`, `flag-C` (with
  `data-owner`), `capture`, `bracket-card`, `bracket-strip`.
- **Alerts and moments**: `flag-notice`, `reconnecting`, `countdown`, `round-end`, `round-end-carry`.
- **Death**: `death`.
- **Corners**: `health`, `armor`, `perks`, `perk-shield`, `ammo`, `gear`, `slot-lethal`, `slot-tactical`,
  `killfeed`, `crosshair`, `scope`, `cook`, `tac`, `flash`, `smoke-screen`.
- **Left column**: `wallet`, `money`, `buy-prompt`, `buy-countdown`, `shop-closed`, `minimap`, `chat`,
  `chat-line`, `chat-input`, `plan-vote`, `plan-active`, `plan-option-{id}`, `hint`.
- **Scoreboard**: `scoreboard`, `sb-row` (`data-bot`), `sb-shaved`.
- **Pause and team picker**: `pause`, `pause-objective`, `pause-lock-refused`, `btn-resume`,
  `btn-fullscreen`, `btn-pause-settings`, `btn-leave`, `team-picker`, `team-0`, `team-1`, `team-answer`.
- **Result**: `result` (`data-outcome`), `result-title`, `result-score`, `result-why`,
  `result-tab-summary`, `result-tab-table`, `result-tab-bracket`, `result-body`, `result-stats`,
  `summary`, `summary-level`, `summary-total`, `summary-levelup`, `summary-headline`, `summary-toggle`,
  `summary-detail`, `summary-badges`, `summary-haircut`, `summary-worst-haircut`, `result-goal`,
  `result-foot`, `result-countdown`, `result-leave`.
- **Shop**: `shop`, `shop-countdown`, `shop-money`, `shop-close`, `shop-tab-1` to `shop-tab-5`,
  `shop-grid`, `shop-detail`, `shop-result`, `shop-{id}`, `buy-{id}`, `sell-{id}`, `why-{id}`,
  `boys-picker`, `boys-class-{id}`.
- **Loading**: `loading`, `loading-objective`, `enter-game`, `loading-cancel`.

### 8.3 New testids and attributes

| owner | testids |
|---|---|
| P2 | `alive-a`, `alive-b` (count in `aria-label` / `data-count`), `round-label`, `warmup-players`, `role-badge`, `mode-line` |
| P3 | none (`plan-active` stays the chip; the rim pins are on the canvas) |
| P4 | `weapon-name`, `c4` |
| P5 | `intro`, `fight`, `round-start`, `role-card`, `halftime`, `alert` (`data-kind`), `bomb-planted`, `last-weapon`, `countdown-aborted`, `new-match`, `shaved-banner`, `round-mvp` |
| P1 | `spectate`, `killer-hp`, `killer-damage`, `late-join` |
| P6 | `podium`, `placement`, `sb-header`, `sb-history`, `result-verdict-why`, plus `data-stage` on `result` |
| P7 | `fade`, `resume-prompt`, `btn-leave-confirm`, `btn-leave-cancel`, `shop-plan`, `settings` (a wrapper around the untouched panel) |

Every zone root carries `data-zone` (P0). The `.hud` root carries `data-alive`, `data-overlay`,
`data-moment`, `data-stage` and `data-banner` (P0, §4.5).

### 8.4 Migrated or removed

- `prep` at `multiplayer.spec.ts:282` matched nothing, so it was a phantom. It now reads `round-end`
  with `toHaveCount(0)` (P1).
- The store's `flagNotice.text` „FADE TOOK A · DEPOT” becomes „A DLA FADE”, with structured `flag`,
  `name` and `team`. The assertion at `:544` is a store check (P1).
- The timer text changes: „START n” is gone and the format is `m:ss` („4:12”). P2 re-pins the gallery
  pins „04:12”, „03:55”, „23:17”, „01:11”, „00:28”, „21:44”, „19:58”, „00:42” and „07:50” to the new
  clock values.
- `bomb-hud` is not rendered in a break. Its pin in `bomb-round-won` is dropped (P2), and „następna
  runda za” is a zone `textAbsent` (P5).
- `infection-line` moves from the mode line to strip row 2 and loses its clock. It still contains „RUNDA
  n / 5” and „N NIEOSTRZYŻONYCH”.
- `objective` moves from the centre card to the ModeLine and holds the ≤ 5-word goal.
- `pause-objective` holds „{MODE_TITLE} · {MAPA}”, with no rules paragraph.
- `loading-objective` holds the `modeGoal` line.
- `.reloading` and `.armor-num.broke` were gallery-only class pins. P4 re-pins `low-health-reloading` to
  `.ammo[data-reloading]` and `.armor[data-broke]`.

### 8.5 Class contracts kept

- `.top-bar[data-mode]` (`multiplayer.spec.ts:772`)
- `.sb-team th` (`:604`)
- `.hud` and `.hud.dormant` (`hud-shot.mjs:27`, the gallery)
- `.hud.low-health`
- The `ui-fit.mjs` classes: `.shop-tile`, `.tile-key` (text `^[1-5]·[0-9]$`), `.result-card`,
  `.result-title`, `.result-score`, `.result-why`, `td.sb-name`, `.round-end`, `.plan`
- `.reel-window > i` (`armoury.spec.ts:74`, untouched)

### 8.6 Text contracts

**Uppercased in JS, pinned:**
- „FLASZKA” (`:465`)
- „ŁADUNEK NA A” (`:151`)
- „ZWYCIĘSTWO” / „PORAŻKA” (`:871-872`, exact `toHaveText`)
- „RUNDA DLA TAPER” (`:160`)
- „PRZEJMUJESZ A” (`:535`)
- „RUNDA 1 / 5”, „1 NIEOSTRZYŻONYCH”, „RUNDA 2 / 5” (`:1027-1079`)

**Case kept exactly** (Playwright `toContainText` is case-sensitive):
- „Ładunek rozbrojony” (`:161`; it is also the short reason)
- „Kupiono: Frag” (`:369`)
- „Brakuje $1,400” (`:377`)
- „numer z kafelka” (`:381`, `:383`)
- „LUNETA” (`:472`)
- „działa jeszcze” (`:476`)
- „nosisz” (`:477`)
- `drabinkę ${n} broni` (`:873`)
- „14 / 14” (`:874`)
- „XP” (`:666`)

**Unit tests that pin text:**
- `resultText.test.ts:40` „FADE 40 — 31 TAPER”: kept (veto).
- `resultText.test.ts:48-51`: the stat order is changed by P6, with the reason written.
- `resultText.test.ts:58-60,90`: kept.
- `roundText.test.ts`: the moved text from `:65-84`, unchanged (long reasons).
- `bracketView.test.ts:18,21,28`: kept.
- `shopCatalog.test.ts:72-89`: kept.
- `invite.test.ts:27`: untouched.
- `hintRules.test.ts:55-58`: under 78 characters, at least 6000 ms.
- `plans.test.ts:40-41`: longer than 20 characters.

### 8.7 Gallery pin migration (P0, step 0b)

Each existing pin moves to the pin file of the package that owns the zone it tests:
- **P2 `top.ts`**:
  - `[data-testid=objective]`, `timer`, `score-goal`, `bomb-hud`, `.bomb-hud.armed`, `timer.urgent`,
    `duel-line`, `infection-line`, `ladder`, `ladder-gun`, `capture`, `flags`;
  - every clock and mode-line text: „ROZGRZEWKA”, „START 3”, „04:12”, „03:55”, „62%”, „START ZA 12s”,
    „23:17”, „MASZ ŁADUNEK”, „01:11”, „ROZBROIĆ”, „00:28”, „21:44”, „ZMIANA STRON” and „OBRONA”
    (bomb-halftime), „19:58”, „ZAMROŻENIE”, „SKLEP OTWARTY JESZCZE 3s”, „NASTĘPNA RUNDA ZA 3s”,
    „MECZBOL”, „00:42”, „RUNDA 2 / 5”, „RUNDA ZA 6s”, „07:50”, „7/14”.
- **P3 `left.ts`**: `buy-prompt`, `plan-vote`.
- **P4 `corners.ts`**: `crosshair`, `killfeed li`, `.hud.low-health`, `.reloading`, `.damage-dir`,
  `.armor-num.broke`, `scope`.
- **P5 `moments.ts`**: `countdown`, `flag-notice`, `round-end.mine` / `.theirs`, `round-end-carry`,
  „RUNDA DLA FADE”, „RUNDA DLA TAPER”.
- **P1 `death.ts`**: `death`, „WRACASZ W NASTĘPNEJ RUNDZIE”, „ODRODZENIE ZA 3”.
- **P6 `end.ts`**: `scoreboard`, `result[data-outcome=win|loss]`, „ZWYCIĘSTWO”, „PORAŻKA”.
- **P7 `screens.ts`**: `shop`, `pause`, `btn-resume`, `loading`, `enter-game`, `.hud.dormant`.

Each owner rewrites its own pins in wave 2 to match §5.2.

### 8.8 Gallery pin types (P0)

| pin | meaning |
|---|---|
| `expect: sel[]` | the element exists (today) |
| `absent: sel[]` | no such element |
| `invisible: sel[]` | it exists and `checkVisibility` is false (a §4.5 hide) |
| `text: string[]` | case-insensitive page innerText (today) |
| `caseText: string[]` | case-sensitive `textContent` |
| `textAbsent: {text, zone?}[]` | not present, optionally only inside one zone |
| `zoneWords: {zone: max}` | a per-scenario word cap for a zone, tighter than §5.1 |
| `leftOf: [selA, selB]` | the box of A ends left of the box of B |
| `noScroll: sel[]` | `scrollHeight ≤ clientHeight + 1` |

## 9 Out of scope → Deferred

These go to `docs/PLAN_2_1.md` Deferred through Ultron:
- **MVP stars on the scoreboard, and a replicated round stage, MVP or round-history field.**
  `grep -rni mvp` finds 0 hits, so any of these needs a new schema field (L6 and Ultron rule 5: stop and
  ask). The client-side round MVP and history ship only with honest gaps.
- **A replay killcam.** It needs server history.
- **The third-person chase cam, a death-cam roll or FOV change, and a killer outline.** Vetoed.
- **Walking with the shop open**, as in CS2. `Game.ts:721-724` turns input off, and the shop's digit keys
  collide with the weapon keys. That is the next round of P1 work.
- **Free-camera spectating** when no target is alive. The bar reads „NIKOGO DO OBSERWOWANIA”.
- **Polish mode names in the menu.** The menu is untouched, and changing it means re-running `menu-fit`
  and `armoury.spec`.
- **Changes to `SettingsPanel.tsx`** (Polish tabs, locked at `PLAN_2_1.md:347-349`). This drop only
  places it beside the pause column.
- **A longer countdown.** Vetoed: the countdown is live combat.
- **Shortening `mm-keyart-in`.** Vetoed: a menu change.
- **A rematch vote.** `C2S.Rematch` is a no-op (`TdmRoom.ts:388`).
- **Overtime at 6:6 in bomb** (`TdmRoom.ts:1887,1918`).
- **The stale Prep MatchEvent in `startPair`** (`TdmRoom.ts:1525`), which can flash a wrong countdown
  for one frame.
- **Deleting the dead constants** `MATCH.waveMs` / `prepMs` and `TOURNAMENT.fillMs`. Only their comments
  are fixed now.
- **The dead „CONNECTING…” labels** (`Menu.tsx:340,501`; `App.tsx:198`).
- **A HUD-scale setting**, removed in #14 (`settings.ts:22-27`).
- **English round-reason strings on the wire.** They are translated on the client, which is acceptable.
- **The Boys class blurbs** in the shop's `title` tooltip (`Shop.tsx:370`, `boys.ts:8-12`), which stay
  English.
- **The weak scoreboard assertion** `.sb-team th` with the filter 'A' (`multiplayer.spec.ts:604`), a
  test-quality fix.
- **Updating `hudshots.mjs`, `hud-shot.mjs` and `gora-shots.mjs`** to the new layout.
- **A per-reason breakdown of money toasts.** Toasts now show the amount only, by design.

**Questions for the owner.** Each is recorded, and none blocks the drop:
- **Q1** MVP stars need a replicated field. Build them in a later drop?
- **Q2** (flagged, not a stop) `bomb.result` now also carries the break reason in ostrzyżeni, and is
  cleared at the duel freeze. This is a behaviour change to an existing replicated field, with no schema
  change.
- **Q3** Translate the mode names in the menu too? The HUD already uses the Polish titles from
  `copy.ts`.
- **Q4** Keep „THE BOYS” and the class names (Scout, Assault, Heavy, Medic, Marksman) as proper names on
  the HUD, or give them Polish titles?
- **Q5** `DUEL.breakMs` is 5000 against CS2's 7000. It stays at 5 s to respect the 47 %-waiting note
  (`PLAN_2_1.md:890-893`).

---

## Appendix A: where each jury graft and veto landed

| graft or veto | where |
|---|---|
| My side on the left by CSS `order`; `score-a`/`score-b` bound to the team | Principle 9, §6.3 `stripSides`, P2 |
| Planted clock = icon plus red fuse digits by default; no bare icon (veto) | §5.2 #15, P2, §6.1 |
| Polish mode titles on HUD surfaces from one `copy.ts`; menu untouched | §3.3, P0 `copy.ts`, P5/P6/P7 |
| `bus.ts` arbiter plus a 1000-seed property test over a pure model | §6.5, P5 |
| Reading budget: words ≤ 3 × seconds | Principle 4, §3.10, §6.5, P1/P2/P5/P6 tests |
| `apart` pairs, three sizes including 1024×576, the kill-feed width cap | §3.6, §4.2–4.3, P0 tool, G3 |
| `:544` as a store assertion, not a DOM read (veto) | P1, §8.1 |
| Round-mode why names the deciding round | §5.4, P6 |
| „MIEJSCE #n Z m” | P6, §5.2 #62 |
| Radar rim pins, canvas text ≥ 14 px | P3, §5.2 #48 |
| `DUEL.breakMs` 5000 with the fit test (veto on 6000) | §6.4, P-SRV |
| Hybrid break detection; the merge order still P0 → P-SRV → wave 2 (veto) | §6.3, §7.0 |
| `BOMB.breakMs ≤ 9000` test citing `:165`; the poll to 12000 | §6.4, P-SRV, P1 |
| `bombBreakMs(round)` helper | §6.4, P-SRV |
| Smaller P0 blast radius: hud-diffed sub-commits, no layer collapsing | P0 steps 0b–0f |
| Money toasts merged within 2500 ms by the money; none at the crosshair (veto) | P3, Principle 6 |
| Pure death-cam and spectate tests; `LocalPlayer`/`prediction`/`RemotePlayer` tests unchanged | P1 |
| CSS lint: `font-size` only in `hud.css`; t3 floor 28 px | Principle 3, §3.1, G4 |
| Keep the `infection-line` testid and text; no spec edits at `:1027-1079` | §5.2 #39, P2 |
| Tab or a tab click jumps to stage C | P6, §6.1 |
| `veil-cost` ≥ 95 % through real states; no full-screen `backdrop-filter` (veto) | Principle 15, P1 |
| Reduced motion: `getAnimations()` = 0 | Principle 11, G5 |
| Render-count check (`useHudSlice` / memo, `hud-bench`) | P0 |
| Money visible while dead | §4.5, P3 |
| Intro off-centre, left of the crosshair; digit only in the last 3 s; no full-width band in the live countdown (veto) | §3.6, §5.2 #2, P5 |
| t1 word badge ATAK/OBRONA/OCALONY/OSTRZYŻONY | P2 |
| Scenarios break-rejoin, dead-in-break, dead-selfkill, match-end-ffa, chat-busy | §5.2 |
| Countdown kept at 4000 (veto on 5000/6000) | §6.4 |
| No WALCZ band at the freeze release (veto) | §6.1 |
| „RUNDA DLA X” and „FADE 40 — 31 TAPER” kept (veto) | P5, P6 |
| FADE/TAPER names kept in the strip; the damage row in words with hit counts (veto) | Principle 9, §5.2 #33 |
| `mm-keyart-in` untouched (veto) | P0/P7 must-not-touch |
| No new `'plant'` money reason; the plant bonus paid as `'round'` (veto) | P-SRV |
| Duel carry line and gungame next weapon kept, each ≤ 3 words (veto) | §5.2 #26, #41 |
| Leave confirmation as explicit [TAK, WYJDŹ] / [ANULUJ] (veto on double-click) | P7 |
| Conditional mounts of Shop/MatchResult; exit via a keep-mounted timer with listeners off (veto) | P0 `useKeepMounted`, P6, P7 |
| No seams in `TdmRoom`/`LocalPlayer`/`Game` in P0 (veto) | P0 must-not-touch |
| Beeps never read `MATCH.prepMs`; no CSS `text-transform` on pinned strings (veto) | P5, Principle 10, G4 |

## Appendix B: the completeness critic's findings and their fixes

| finding | severity | fix |
|---|---|---|
| Test names collide with modules in `moduleNames.test.ts:39-54` | blocker | `TopStrip.test.ts` and `Moments.test.ts` (§7.9); `moduleNames.test.ts` in G1; no directory import of `ui/hud` (§7.0) |
| G3 impossible for parallel packages | blocker | `--zones` scope: a package gates only its zones, own pairs and pins; whole-scenario checks move to the integration and final gates, with a rule for who fixes (§7.0) |
| Modal budgets counted the HUD under the modal | blocker | §4.5 rows hide every zone under shop, Tab, pause and result B/C; budgets recomputed (§5.1, §5.2 #49–57, #59–63) |
| `top` budget broken by `sr-only` counts | major | counts in `aria-label`/`data-count`, with the test "alive counts … never in text" (P2) |
| Death card over its own reading budget | major | `countWords` defined (§3.10); the card holds 5000 ms; the short weapon name; 14 static ≤ 15 with the vetoed hit counts kept (§6.5) |
| Wrong reading-budget worst cases | major | short reasons (§5.4); the carry line at 2 words; stage B at 3 s with a ≤ 3-word why and its own test; stage C timings and trims; pair card ≤ 18 (§6.5) |
| Missing copy for HUD states | major | §5.3 covers every bomb line; new rows `bomb-live-defender`, `-escort`, `bomb-dropped`, `bomb-teammate-defusing`, `ffa-live`, `boys-live`, `match-end-turniej` |
| Missing looks and durations | major | §6.1 rows for late join, loading/error → menu, countdown aborted, between pairs, the role card, alerts, settings, the team picker, the spectated player dying, and the resume prompt; walkover-proof `betweenPairs` (§6.3) |
| Loading showed the wrong mode | major | props from `play(...)`, the join-by-id title, a re-done fixture (§5.2 #64, P7) |
| English left over | major | error codes (§5.5), the full team picker (§5.6), the FFA scoreboard header, the `pause-teams` and `menu-error` scenarios with English greps |
| Full-screen layers inside zone roots; no `bracket` zone | major | `veil` zone excluded (§4.2, P0 0d); `bracket` zone with box, budget and pairs |
| Banner × feed overlap at 1280×720 | major | `--hud-banner-w` derived from `--hud-feed-w` (§3.6); the pair `banner` × `feed` (§4.3) |
| Acceptance lines that no test could check | major | pure `stripSides` plus the `leftOf` pin; `__canvasText` / `canvasMin` and `animMaxMs` in P0's tool; spectate in `hudfeed.spec`; a frame-probe pass rule for entry; `veil-cost` through real states; named tests for `resultStage`, `useKeepMounted` and `pause-settings` |
| P3/P5 depended on P7's harness | major | `uiFit.tsx` owned and frozen by P0, every mount wrapped in `.hud`, standalone signatures frozen (§7.0) |
