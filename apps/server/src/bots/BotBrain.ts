import {
  BOT_PRESETS, Btn, PLAYER, TICK_MS, WEAPONS, aimDirection, findPath, itemPrice, spreadDirection, wrapAngle,
  type BotLevel, type BotPreset, type GameMode, type NavPoint, type PlayerInput, type Walk, type WeaponId,
} from "@frankibarber/shared";

/**
 * Bot brain (drop 5). One per bot, pure decision-making: it looks at what the room shows it
 * (`BotSenses`) and answers with one movement input plus optional fire / reload / buy requests.
 * The room executes those through the SAME paths a human's messages take (rate limits, ammo,
 * origin checks), so a bot cannot do anything a player could not.
 *
 * Behaviour: notice an enemy in sight range with line of sight → turn onto them at a finite rate,
 * wait the reaction time, then shoot with the preset's aim error, working the range on foot.
 * Otherwise walk an A* path over the walk grid to a goal (an enemy-held / neutral flag in
 * Domination, a random roam point elsewhere), sprinting on long legs, jumping at a rise, and
 * re-planning when stuck. Everything uses the room's seeded PRNG so tests are repeatable.
 *
 * MOVEMENT (drop 6d). Three things made bots read as jerky and aimless, and all three were in
 * here rather than in the pathfinder:
 *
 *  - THEY STOPPED TO TURN. Forward was pressed only once the body was within 0.6 rad of the way it
 *    wanted to go, so every corner was a visible pause of a fifth of a second — longer for an easy
 *    bot, whose turn rate is 3.2 rad/s. A person walks in the direction they want while their head
 *    is still coming round. `strafeTo` resolves the wanted direction into the eight-way button
 *    combination that matches it, so the body never waits for the head.
 *  - THEY CHANGED THEIR MIND EVERY 2.5 s. `REPLAN_MS` re-picked the roam GOAL, not just the route,
 *    so a bot halfway down a street would turn round and head somewhere else. The goal now stands
 *    until it is reached, becomes unreachable, or the bot gets stuck; only the ROUTE is re-planned,
 *    and only when the goal moves, the bot drifts off it, or it goes stale.
 *  - THEY THREW THE ROUTE AWAY TO FIGHT. Every combat frame cleared the path, so the end of a
 *    fight meant a fresh search AND — with the point above — usually a fresh destination too. The
 *    destination was the part that mattered; the route is kept as well, but be clear about what
 *    that is worth: MEASURED at 4 searches either way over a 22 s run with a fight in it, because
 *    the nav branch does not run during combat and the chase re-plans on the way out regardless.
 *    It is kept because throwing away work is still wrong, not because it showed up in a number.
 *
 * What the search COUNT did catch, all three found by measuring rather than by reading: a bot that
 * had arrived asking for a new route on every tick for ever (857 searches in 22 s), drift measured
 * to the next waypoint rather than to the leg being walked, so a long straight read as off-route on
 * every tick (326), and a chase re-arming an unreachable goal inside its own back-off (47).
 */

export interface BotView { id: string; team: number; x: number; y: number; z: number; crouching: boolean }

export interface BotSenses {
  now: number;
  me: { id: string; team: number; x: number; y: number; z: number; crouching: boolean; grounded: boolean; ammo: number; magazine: number; reserve: number; weapon: WeaponId; fireIntervalMs: number };
  /** Alive players the bot may shoot (the room applies the team rule). */
  enemies: BotView[];
  /** Line of sight between two world points (no players in the way is not required). */
  /** Line of sight; `id` names the enemy so the room may reuse a recent verdict (task 2). */
  los(ax: number, ay: number, az: number, bx: number, by: number, bz: number, id?: string): boolean;
  /** Domination flags (empty in other modes). */
  flags: { x: number; y: number; z: number; owner: number; contested: boolean }[];
  /** Places worth walking to when there is nothing else to do. */
  roamPoints: NavPoint[];
  /**
   * May this bot run a path search on this tick? The room hands the permission out on a rotation so
   * that no frame carries more than one search — see `BotDecision.planned`.
   */
  mayPlan?: boolean;
  /** Server-applied flash blindness. Hidden enemies must not be acquired or tracked. */
  blinded?: boolean;
  objective?: NavPoint;
  hazards?: { x: number; y: number; z: number; radius: number }[];
  /**
   * Drop D: which mode is being played, so a bot can want the right thing. The brain reads it for
   * ONE decision — the Ostrzyżeni role below — and infers everything else from what it can see, as
   * it did before. Gun Game needs no branch at all: the room hands out the rung weapon and the
   * range bands already come from the weapon in hand.
   */
  mode?: GameMode;
  /**
   * Drop D: this bot is on the shaved side (Ostrzyżeni) — it hunts with the clippers instead of
   * fighting at range, and its `objective` is the nearest survivor rather than a fixed point.
   */
  shaved?: boolean;
}

export interface BotDecision {
  input: PlayerInput;
  fire: { o: [number, number, number]; d: [number, number, number] } | null;
  reload: boolean;
  /** A path search ran on this tick. The room uses it to keep its per-tick budget honest. */
  planned: boolean;
}

/** How long a route stays trusted before it is re-planned (the map is static; goals move). */
const REPLAN_MS = 6000;
/** How long a roam GOAL stands. Long, because a bot that keeps changing its mind looks broken. */
const GOAL_MS = 25000;
/**
 * How long to wait before looking for a goal again after arriving, or after failing to find one.
 *
 * Not a nicety: without it a bot that has arrived clears its goal, `pickGoal` hands back the point
 * it is standing on, that "route" is instantly complete, and it starts again — MEASURED at 857
 * searches over 22 s of one idle bot, one per tick, for ever. The pause also reads better: a
 * person stops for a beat on arrival rather than pivoting on the spot.
 */
const IDLE_MS = 700;
const STUCK_CHECK_MS = 1200;
const STUCK_DIST = 0.3;
/** A waypoint counts as reached inside this: one grid cell, so the bot cuts corners rather than
 * pivoting on each one. */
const WP_REACH = 0.55;
/**
 * Drift this far from the LEG being walked and the route is stale — re-plan.
 *
 * From the leg, not from the waypoint ahead: the smoothed routes have legs far longer than this, so
 * measuring the distance to the next waypoint reads as "off route" on nearly every tick of a long
 * straight — MEASURED at 326 searches over 22 s where the right answer is a handful.
 */
const OFF_PATH = 6;
/** After losing sight the bot still heads for the last known position for this long. */
const CHASE_MS = 2500;
/**
 * Drop D, Ostrzyżeni: how much room a survivor bot tries to keep between itself and a chaser it can
 * see. Comfortably outside the clippers' 2.1 m reach and outside the lunge a chaser with the speed
 * perk can make in a reaction time, so backing off is a real answer rather than a delay.
 */
const FLEE_RANGE = 9;
/** How long a hunter roams instead of asking again for a survivor it cannot reach. */
const CHASE_BLOCKED_MS = 3000;
/** Standing this close to the last known spot counts as having looked: the chase ends. */
const CHASE_ARRIVE = 2.5;
/** sin(22.5°): the half-width of one of the eight movement octants. */
const OCTANT = Math.sin(Math.PI / 8);
/** Fraction of the remaining turn taken per tick, on top of the preset's hard rate cap. Turning at
 * the cap right up to the last degree and then stopping dead is what reads as robotic. */
const TURN_EASE = 0.35;
/**
 * Sprinting is deliberately sticky. Both the distance left and how straight the leg is get a pair
 * of thresholds rather than one, and a state change has to hold for SPRINT_HOLD_MS. MEASURED with
 * a single threshold on each: nine sprint changes in twelve seconds over a 40 m walk — one at
 * every corner, which is the stutter the old `path.length - wp > 2` rule produced by another
 * route. Dropping the sprint for a 20° bend is not something a player does.
 */
const SPRINT_ON = 9;
const SPRINT_OFF = 4.5;
const SPRINT_STRAIGHT_ON = 0.35;
const SPRINT_STRAIGHT_OFF = 1.0;
const SPRINT_HOLD_MS = 600;

const dirTmp: [number, number, number] = [0, 0, 0];
const outTmp: [number, number, number] = [0, 0, 0];

export class BotBrain {
  readonly preset: BotPreset;
  private seq = 0;
  yaw = 0;
  pitch = 0;
  private path: NavPoint[] | null = null;
  private wp = 0;
  private goal: NavPoint | null = null;
  /** The goal the current `path` was planned for — a moved goal is a stale route. */
  private pathGoal: NavPoint | null = null;
  private replanAt = 0;
  private goalAt = 0;
  /** Drop D: a hunter roams until this time rather than re-asking for a survivor it cannot reach. */
  private chaseBlockedUntil = 0;
  private sprinting = false;
  private sprintHold = 0;
  private target: string | null = null;
  private firstSeenAt = 0;
  private lastSeenAt = 0;
  private lastKnown: NavPoint | null = null;
  private lastFireAt = 0;
  private stuckAt = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private strafe = 1;
  private strafeUntil = 0;
  private jumpUntil = 0;
  private burstShots = 0;
  private burstRestUntil = 0;

  constructor(level: BotLevel, private walk: Walk, private rand: () => number) {
    this.preset = BOT_PRESETS[level];
  }

  /** New life: forget the path and the target. */
  onSpawn(yaw: number): void {
    this.yaw = yaw; this.pitch = 0;
    this.path = null; this.pathGoal = null; this.goal = null; this.wp = 0;
    this.replanAt = 0; this.goalAt = 0; this.sprinting = false; this.sprintHold = 0;
    this.target = null; this.lastKnown = null; this.lastSeenAt = 0;
    this.stuckAt = 0;
    this.burstShots = 0; this.burstRestUntil = 0;
  }

  /** Pick an affordable primary on spawn; null keeps the existing loadout. */
  pickBuy(money: number, owned: readonly string[]): WeaponId | null {
    const order: WeaponId[] = ["rifle", "smg", "shotgun", "dmr", "smg2"];
    if (owned.some((w) => order.includes(w as WeaponId))) return null;
    // Sample every affordable choice, so the room includes close- and long-range roles.
    const pool = order.filter((w) => itemPrice(w) <= money);
    if (pool.length === 0) return null;
    return pool[Math.min(pool.length - 1, Math.floor(this.rand() * pool.length))];
  }

  think(s: BotSenses): BotDecision {
    const me = s.me;
    const now = s.now;
    const p = this.preset;
    const weapon = WEAPONS[me.weapon];
    const engageRange = Math.min(p.engageRange, weapon.rangeMax);
    const preferredRange = Math.min(engageRange * 0.65, weapon.range * 0.8);
    const eyeY = me.y + (me.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight);
    // Drop D: the two Ostrzyżeni roles. A hunter has the clippers and must arrive; its quarry has a
    // gun and must not let it. Everything else about the brain is unchanged in both.
    const hunting = s.mode === "ostrzyzeni" && !!s.shaved;
    const fleeing = s.mode === "ostrzyzeni" && !s.shaved;
    let buttons = 0;
    let fire: BotDecision["fire"] = null;
    let reload = false;
    let planned = false;

    // ---- perception: nearest enemy in range with line of sight to the chest
    let seen: BotView | null = null, seenD = Infinity, bestPriority = Infinity;
    for (const e of s.enemies) {
      if (s.blinded) break;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      // 120-degree field of view. Close footsteps reveal someone only inside 3 metres.
      if (d > 3 && Math.abs(wrapAngle(Math.atan2(e.x - me.x, e.z - me.z) - this.yaw)) > Math.PI / 3) continue;
      // Stay on the current opponent unless another is substantially closer. Tiny distance
      // changes between two enemies must not repeatedly restart the reaction timer.
      const priority = d * (e.id === this.target ? 0.72 : 1);
      if (d > p.sightRange || priority >= bestPriority) continue;
      const cy = e.y + (e.crouching ? 0.7 : 1.1);
      if (!s.los(me.x, eyeY, me.z, e.x, cy, e.z, e.id)) continue;
      seen = e; seenD = d; bestPriority = priority;
    }
    if (seen) {
      if (this.target !== seen.id || now - this.lastSeenAt > 200) {
        this.target = seen.id; this.firstSeenAt = now; this.burstShots = 0;
      }
      this.lastSeenAt = now;
      this.lastKnown = { x: seen.x, y: seen.y, z: seen.z };
    } else if (this.target && now - this.lastSeenAt > CHASE_MS) {
      this.target = null; this.lastKnown = null;
    }

    if (seen) {
      // ---- combat: turn onto the chest at a finite rate, shoot after the reaction time.
      const cy = seen.y + (seen.crouching ? 0.7 : 1.1);
      const dx = seen.x - me.x, dy = cy - eyeY, dz = seen.z - me.z;
      const wantYaw = Math.atan2(dx, dz);
      const wantPitch = -Math.atan2(dy, Math.hypot(dx, dz));
      this.turnTowards(wantYaw, wantPitch, p.turnRate * TICK_MS / 1000);
      const err = Math.abs(wrapAngle(wantYaw - this.yaw)) + Math.abs(wantPitch - this.pitch);
      const ready = now - this.firstSeenAt >= p.reactionMs;
      /**
       * How straight the bot has to be looking before it pulls the trigger. A bullet wants the
       * 0.06 rad it has always wanted; a SWING does not. The server resolves a melee hit as a ray
       * against the body box (`traceBullet` with `MELEE.range`), so at two metres a 0.35 m half-width
       * subtends about 0.17 rad — three times the bullet gate. Holding a swing to the bullet gate is
       * why a chaser could stand next to somebody and never touch them: MEASURED at zero conversions
       * in a 60 s round with the chaser reaching 2.3 m again and again.
       */
      const swinging = weapon.kind === "melee";
      const aimGate = swinging ? Math.max(0.12, Math.atan2(PLAYER.halfWidth * 0.8, Math.max(0.5, seenD))) : 0.06;
      if (me.ammo === 0 && me.reserve > 0) reload = true;
      // A swing has no burst to rest between: its own fire interval is the whole cadence.
      else if (ready && (swinging || now >= this.burstRestUntil) && err < aimGate && seenD <= engageRange && (me.ammo > 0 || swinging) && now - this.lastFireAt >= me.fireIntervalMs * p.cadence) {
        aimDirection(this.yaw, this.pitch, dirTmp);
        spreadDirection(dirTmp[0], dirTmp[1], dirTmp[2], p.aimError, this.rand, outTmp);
        fire = { o: [me.x, eyeY, me.z], d: [outTmp[0], outTmp[1], outTmp[2]] };
        this.lastFireAt = now;
        if (++this.burstShots >= (p.id === "hard" ? 5 : 3)) {
          this.burstShots = 0;
          this.burstRestUntil = now + (p.id === "hard" ? 350 : 650) + this.rand() * 250;
        }
      }
      // Footwork: work the range for the weapon in hand, and strafe THROUGHOUT rather than only in
      // the middle band. Standing square on while closing is what made a bot in a fight read as a
      // turret on rails; a player is always sliding.
      if (now >= this.strafeUntil) { this.strafe = this.rand() < 0.5 ? -1 : 1; this.strafeUntil = now + 700 + this.rand() * 900; }
      buttons |= this.strafe < 0 ? Btn.Left : Btn.Right;
      // The bands come from the weapon's own engage range, so a shotgun bot closes and a sniper bot
      // holds — with 16 m and 5 m fixed, both did the same thing.
      if (hunting) {
        // A chaser closes and keeps closing: with the clippers there is no band to hold, and
        // backing off inside the reach (what the range rule below would do) is how a hunter reads
        // as indecisive. Sprint too — the speed perk is the side's whole advantage.
        buttons |= Btn.Forward;
        if (seenD > weapon.range) buttons |= Btn.Sprint;
      } else if (fleeing && seenD < FLEE_RANGE) {
        // Keep the clippers off you while you shoot: away from the chaser, not merely "back".
        buttons = (buttons & ~(Btn.Forward | Btn.Left | Btn.Right))
          | this.strafeTo(Math.atan2(me.x - seen.x || 0.1, me.z - seen.z || -0.1));
      } else if (me.ammo === 0 && me.reserve > 0) buttons |= Btn.Back;
      else if (seenD > preferredRange * 1.2) buttons |= Btn.Forward;
      else if (seenD < preferredRange * 0.65) buttons |= Btn.Back;
      // Aiming slows movement and reduces the server's spread, just as it does for humans — but
      // never while running for your life or after somebody.
      if (ready && seenD > 10 && me.ammo > 0 && !hunting && !fleeing) buttons |= Btn.Aim;
      // The route is NOT thrown away here: see the note at the top of the file.
    } else {
      // ---- navigation
      // The GOAL stands until it is reached, proves unreachable, or goes properly stale. Only the
      // ROUTE to it is cheap enough to redo, and only when there is a reason to.
      // Chase the last place the enemy was seen — until the bot is standing on it. Arriving and
      // finding nobody ENDS the chase; without that the bot arrives, the route completes, the chase
      // hands back the same spot, and it plans a one-waypoint route to its own feet on every tick
      // until the chase timer runs out.
      if (s.objective && hunting && now >= this.chaseBlockedUntil) {
        // The hunter's objective is a PERSON, not a site: it moves, and arriving at where they were
        // is not the end of anything. So no arrival spin and no waiting for the goal timer — the
        // goal is re-pointed every tick and the route is re-planned when it drifts (`stale` below).
        //
        // `chaseBlockedUntil` is what stops that from becoming a stand-still. A survivor a few
        // metres away with no route to them (a floor above, the far side of a wall) makes the plan
        // fail — or complete instantly on the bot's own feet — and re-pointing the goal on the next
        // tick asks the same impossible question for ever. MEASURED before the back-off: a chaser
        // frozen on one spot for the last 30 s of a round with a survivor 6.6 m away. With it, the
        // hunter goes back to roaming for a moment, which moves it, which changes the question.
        this.goal = s.objective;
      } else if (s.objective && !hunting) {
        if (Math.hypot(me.x - s.objective.x, me.z - s.objective.z) < 1.7) {
          this.goal = null; this.path = null; this.pathGoal = null;
          this.yaw = wrapAngle(this.yaw + TICK_MS / 1000 * 0.5);
        } else if (this.path || now >= this.goalAt) this.goal = s.objective;
      } else if (this.target && this.lastKnown && Math.hypot(this.lastKnown.x - me.x, this.lastKnown.z - me.z) > CHASE_ARRIVE) {
        this.goal = this.lastKnown;
      } else {
        if (this.lastKnown) { this.lastKnown = null; this.target = null; }
        if (now >= this.goalAt) { this.goal = this.pickGoal(s); this.goalAt = now + (this.goal ? GOAL_MS : IDLE_MS); }
      }
      if (this.goal) {
        const stale =
          !this.path ||
          now >= this.replanAt ||
          !this.pathGoal ||
          Math.hypot(this.pathGoal.x - this.goal.x, this.pathGoal.z - this.goal.z) > 1 ||
          this.offRoute(me.x, me.z) > OFF_PATH;
        if (stale && s.mayPlan !== false) {
          planned = true;
          this.path = findPath(this.walk, { x: me.x, y: me.y, z: me.z }, this.goal);
          this.pathGoal = this.path ? { ...this.goal } : null;
          this.wp = this.path && this.path.length > 1 ? 1 : 0;
          this.replanAt = now + REPLAN_MS;
          if (!this.path) {
            // Unreachable. Drop the chase with it: a bot that cannot get to the last place it saw
            // someone should go back to roaming, not ask again. Without clearing `lastKnown` the
            // chase re-arms the same goal on the very next tick and the back-off never applies —
            // MEASURED at one failed search per tick for the whole 2.5 s chase window.
            this.goal = null; this.goalAt = now + IDLE_MS; this.lastKnown = null; this.target = null;
            if (hunting) this.chaseBlockedUntil = now + CHASE_BLOCKED_MS;
          }
        }
      }
      if (this.path) {
        let w = this.path[this.wp];
        while (w && Math.hypot(w.x - me.x, w.z - me.z) < WP_REACH && this.wp < this.path.length - 1) w = this.path[++this.wp];
        const left = this.remaining(me.x, me.z);
        if (w && (Math.hypot(w.x - me.x, w.z - me.z) >= WP_REACH || this.wp < this.path.length - 1)) {
          const wantYaw = Math.atan2(w.x - me.x, w.z - me.z);
          // Difficulty limits combat aiming; ordinary cornering must remain responsive enough
          // to follow narrow routes without clipping their inside edge.
          this.turnTowards(wantYaw, 0, Math.max(5.5, p.turnRate) * TICK_MS / 1000);
          // Walk NOW, in whatever direction is wanted, while the head comes round separately.
          buttons |= this.strafeTo(wantYaw);
          // Sprint on the long straight legs only. Sprinting needs Forward, so a bot cutting
          // sideways simply walks.
          const off = Math.abs(wrapAngle(wantYaw - this.yaw));
          if (now >= this.sprintHold) {
            const want = this.sprinting
              ? left > SPRINT_OFF && off < SPRINT_STRAIGHT_OFF
              : left > SPRINT_ON && off < SPRINT_STRAIGHT_ON;
            if (want !== this.sprinting) { this.sprinting = want; this.sprintHold = now + SPRINT_HOLD_MS; }
          }
          if (this.sprinting && (buttons & Btn.Forward)) buttons |= Btn.Sprint;
          if (w.y > me.y + PLAYER.stepHeight + 0.05 && Math.hypot(w.x - me.x, w.z - me.z) < 1.2) this.jumpUntil = now + 80;
        } else {
          this.goal = null; this.goalAt = now + IDLE_MS; this.path = null; this.pathGoal = null; // arrived
          // Arriving where a survivor is and not being able to touch them (they are a floor up, or
          // the route ends against a wall between you) is the same dead end as an unreachable one.
          if (hunting && !seen) this.chaseBlockedUntil = now + CHASE_BLOCKED_MS;
        }
      }
      if (me.ammo < me.magazine * 0.4 && me.reserve > 0) reload = true;
      // Stuck: barely moved while trying to walk → hop and re-plan somewhere else.
      if (buttons & Btn.Forward) {
        if (this.stuckAt === 0) { this.stuckAt = now; this.stuckX = me.x; this.stuckZ = me.z; }
        else if (now - this.stuckAt >= STUCK_CHECK_MS) {
          if (Math.hypot(me.x - this.stuckX, me.z - this.stuckZ) < STUCK_DIST) {
            this.jumpUntil = now + 80;
            // Re-route around the corner, but retain the destination. Dropping it within the
            // six-metre roaming exclusion radius used to strand a bot just short of its goal.
            this.goalAt = now + GOAL_MS; this.path = null; this.pathGoal = null; this.replanAt = 0;
          }
          this.stuckAt = now; this.stuckX = me.x; this.stuckZ = me.z;
        }
      } else this.stuckAt = 0;
    }
    if (now < this.jumpUntil && me.grounded) buttons |= Btn.Jump;

    // Fire is a visible hazard, not a target. Retreat before shooting or committing to a plant.
    const danger = s.hazards?.find(h => Math.abs(me.y - h.y) < 1.6 && Math.hypot(me.x - h.x, me.z - h.z) < h.radius + 1.3);
    if (danger) {
      const away = Math.atan2(me.x - danger.x || 0.1, me.z - danger.z || -0.1);
      buttons = this.strafeTo(away); fire = null;
      this.goal = null; this.path = null; this.pathGoal = null;
    }

    return { input: { seq: ++this.seq, dt: TICK_MS, buttons, yaw: this.yaw, pitch: this.pitch }, fire, reload, planned };
  }

  /**
   * Turn the head towards (yaw, pitch), capped at `maxStep` per tick AND easing into the last few
   * degrees. The cap alone means turning flat out right up to the target and stopping dead, which
   * is the single thing that reads most like a machine.
   */
  private turnTowards(yaw: number, pitch: number, maxStep: number): void {
    const dy = wrapAngle(yaw - this.yaw) * TURN_EASE;
    this.yaw = wrapAngle(this.yaw + Math.max(-maxStep, Math.min(maxStep, dy)));
    const dp = (pitch - this.pitch) * TURN_EASE;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + Math.max(-maxStep, Math.min(maxStep, dp))));
  }

  /**
   * The buttons that carry the body towards `wantYaw` given where the head currently points.
   *
   * `stepBody` builds the wish direction as `forward * (sin yaw, cos yaw) + side * (cos yaw, −sin
   * yaw)`, so in the bot's own frame the wanted direction is exactly (cos rel, sin rel) with
   * `rel = wantYaw − yaw`. Pressing each axis whose component clears one octant half-width gives
   * the nearest of the eight directions the button set can express.
   */
  private strafeTo(wantYaw: number): number {
    const rel = wrapAngle(wantYaw - this.yaw);
    const fwd = Math.cos(rel), side = Math.sin(rel);
    let b = 0;
    if (fwd > OCTANT) b |= Btn.Forward; else if (fwd < -OCTANT) b |= Btn.Back;
    if (side > OCTANT) b |= Btn.Right; else if (side < -OCTANT) b |= Btn.Left;
    return b;
  }

  /** Metres from the bot to the leg it is currently walking (the segment ending at `wp`). */
  private offRoute(x: number, z: number): number {
    const path = this.path;
    if (!path) return 0;
    const i = Math.min(this.wp, path.length - 1);
    const b = path[i];
    const a = i > 0 ? path[i - 1] : b;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
  }

  /** Metres left to walk: to the current waypoint, then along the rest of the route. */
  private remaining(x: number, z: number): number {
    const path = this.path;
    if (!path) return 0;
    let i = Math.min(this.wp, path.length - 1);
    let d = Math.hypot(path[i].x - x, path[i].z - z);
    for (; i < path.length - 1; i++) d += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
    return d;
  }

  private pickGoal(s: BotSenses): NavPoint | null {
    const me = s.me;
    if (s.flags.length) {
      // Domination: the nearest flag that is not ours (or is being fought over).
      let best: NavPoint | null = null, bestD = Infinity;
      for (const f of s.flags) {
        if (f.owner === me.team && !f.contested) continue;
        const d = Math.hypot(f.x - me.x, f.z - me.z);
        if (d < bestD) { bestD = d; best = { x: f.x, y: f.y, z: f.z }; }
      }
      if (best) return best;
    }
    if (s.roamPoints.length === 0) return null;
    // Roam: a random point that is not right here. Null rather than `roamPoints[0]` when nothing is
    // far enough — handing back the spot the bot is standing on makes an instantly-complete route,
    // and it asks again the very next tick.
    for (let i = 0; i < 6; i++) {
      const r = s.roamPoints[Math.floor(this.rand() * s.roamPoints.length)];
      if (Math.hypot(r.x - me.x, r.z - me.z) > 6) return r;
    }
    return null;
  }
}
