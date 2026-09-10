/**
 * Quantises a frame's `dt` to the tenth of a millisecond the wire carries, CARRYING the remainder
 * into the next frame.
 *
 * Why this exists instead of `Math.round(dtMs * 10) / 10` at the call site: rounding each frame on
 * its own biases the whole stream, because a real display's frame time is not a tenth of a
 * millisecond. A 60 Hz vsync frame is 16.6667 ms, which rounds UP to 16.7 — so a 60 Hz client asks
 * the server for 1002 ms of simulation per 1000 ms of real time, every second it plays.
 *
 * The server refuses to sell more time than has passed: the time bank refills exactly `TICK_MS` per
 * tick (`TdmRoom.step`), so a 0.2 % overdraft drains the bank's 120 ms of slack in about a minute of
 * play. From then on the room cannot afford the input in front of it on roughly every other tick,
 * so the player's movement stalls for that tick, their queue backs up until the oldest input is
 * discarded outright, and a discarded input is a permanent disagreement between what they predicted
 * and where the server put them — i.e. the game gets less smooth the longer the match runs, on the
 * commonest refresh rate there is.
 *
 * With the carry, the sent stream sums to real elapsed time (within one tenth of a millisecond, at
 * any framerate), which is exactly the contract the bank is written against.
 *
 * Deliberately NOT carried: time above `MAX_INPUT_DT_MS`. That clamp is what stops a tab that was
 * asleep for two seconds from buying two seconds of movement in one input, and owing the client the
 * difference afterwards would hand it back.
 */
import { INPUT_DT_STEP_MS, MAX_INPUT_DT_MS } from "./constants";

const PER_MS = 1 / INPUT_DT_STEP_MS;

export class InputDt {
  /** Unsent fraction of a step, always within ±one step; never a store of real time. */
  private carry = 0;

  /** The `dt` to put on this frame's input. Allocation-free: one number in, one number out. */
  step(dtMs: number): number {
    const real = dtMs > MAX_INPUT_DT_MS ? MAX_INPUT_DT_MS : dtMs > 0 ? dtMs : 0;
    const want = real + this.carry;
    // One step is the floor: `dt: 0` inputs would cost nothing and still consume a seq.
    const dt = Math.max(INPUT_DT_STEP_MS, Math.round(want * PER_MS) / PER_MS);
    const carry = want - dt;
    this.carry = carry > INPUT_DT_STEP_MS ? INPUT_DT_STEP_MS : carry < -INPUT_DT_STEP_MS ? -INPUT_DT_STEP_MS : carry;
    return dt;
  }

  /** Forgets the debt. Called when the stream restarts (respawn, reconnect) so it cannot cross a gap. */
  reset(): void { this.carry = 0; }
}
