---
name: plan-keeper
description: Use at the start and end of every BarberStrike work session, or whenever asked "what's next", "where were we", "update the plan", or before starting any feature work in this repo. Keeps work aligned to docs/PLAN_2_1.md and its ledger.
---

# Plan keeper — BarberStrike 2.1

The repo has a plan of record at `docs/PLAN_2_1.md`. This skill makes sure every session starts
from it and ends by writing to it.

## On session start

1. Read `docs/PLAN_2_1.md` fully (it is kept short on purpose). Do not read other docs yet.
2. Read the **last five rows** of the ledger and the **Deferred** list.
3. Say, in three lines: which drop is current, what the last session finished, what this
   session will finish. If the owner asked for something outside the plan, say which drop it
   belongs to, or that it belongs in Deferred, before doing anything.
4. Check out or create `drop/<letter>-<slug>`. Never work on `main`.

## During the session

- One drop. Anything else you notice → append one line to **Deferred** immediately, then
  continue.
- Before claiming any visual result about weapons, run the relevant tool (`weapon-parts.mjs`,
  `vm-fit.mjs`, `hand-pose.mjs`) and save its output under `apps/client/e2e/out/`. Cite the path.
- Before any change to `WeaponDef` damage, a schema field, tick/snapshot rates, or gating: stop
  and quote the locked decision (L1–L7 or ARCHITECTURE.md) that it would violate, and ask.

## On session end (mandatory — do this before the final report)

1. Append **one row** to the ledger: date, drop, branch, what was done, evidence paths, tests
   (`typecheck/test/build/e2e` each as ✓ or ✗), status word.
2. If a decision was made, append it to **Decisions log** with the date and who decided.
3. Commit the plan change with subject `plan: ledger <date> drop <letter>`.
4. Then give the owner the ≤ 20-line report described in `MASTER_PROMPT.md`.

## If the plan and the code disagree

The code is what is true; the plan is what was intended. Write the discrepancy into the
Decisions log as a proposal, keep following the plan, and let the owner decide.
