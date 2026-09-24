import { OSTRZYZENI, TEAM_NAMES, type GameMode, type Team } from "@frankibarber/shared";

/**
 * Drop U: the words for how a ROUND ended — the round banner's, the pair card's and the result's.
 * Moved verbatim out of `ui/resultText.ts` by P0 (which still re-exports every name, so no caller
 * changed); owned by P5 from here (docs/UI_U_SPEC.md §5.4, §7.0).
 */

/** Ostrzyżeni's sides, in the team slots (see Hud.tsx). */
export const OSTRZYZENI_SIDES = ["OCALENI", "OSTRZYŻENI"] as const;
export const sideNames = (mode: GameMode): readonly [string, string] => (mode === "ostrzyzeni" ? OSTRZYZENI_SIDES : TEAM_NAMES);

/** Polish for the server's bomb / duel round reasons (`bomb.result`). Unknown strings pass through. */
const ROUND_REASON: Record<string, string> = {
  "BOMB DETONATED": "Ładunek wybuchł",
  "BOMB DEFUSED": "Ładunek rozbrojony",
  "DEFENDERS ELIMINATED": "Obrońcy wyeliminowani",
  "ATTACKERS ELIMINATED": "Atakujący wyeliminowani",
  "SITE SECURED": "Czas minął, ładunku nie podłożono",
  "TRADE": "Obaj padli — runda bez punktu",
  "ELIMINATED": "Przeciwnik wyeliminowany",
  "TIME · EVEN": "Czas minął przy równym zdrowiu",
  "TIME · MORE HEALTH": "Czas minął — więcej zdrowia wygrywa",
};
export const roundReasonText = (result: string): string => ROUND_REASON[result] ?? result;

export interface RoundEnd { title: string; why: string; mine: boolean | null }

/**
 * The round card: who took the round and why, from the mode's real signals — the bomb's `result`
 * string (whose side follows from it and the attacking team), the duel's reason string plus the
 * winner the Prep event carried, Ostrzyżeni's winner alone. Null when the state does not say.
 */
export function roundEnd(mode: GameMode, bombResult: string, roundWinner: Team | -1, attackTeam: Team | -1, myTeam: Team): RoundEnd | null {
  const [a, b] = sideNames(mode);
  const won = (t: Team) => ({ title: `RUNDA DLA ${t === 0 ? a : b}`, why: "", mine: t === myTeam });
  if (mode === "bomb") {
    if (!bombResult || attackTeam === -1) return null;
    const attackers = bombResult === "BOMB DETONATED" || bombResult === "DEFENDERS ELIMINATED";
    const t = (attackers ? attackTeam : 1 - attackTeam) as Team;
    return { ...won(t), why: roundReasonText(bombResult) };
  }
  if (mode === "duel") {
    if (!bombResult) return null;
    if (roundWinner === -1) return { title: "RUNDA BEZ ROZSTRZYGNIĘCIA", why: roundReasonText(bombResult), mine: null };
    return { ...won(roundWinner), why: roundReasonText(bombResult) };
  }
  if (mode === "ostrzyzeni") {
    if (roundWinner === -1) return null;
    return { ...won(roundWinner), why: roundWinner === OSTRZYZENI.survivorTeam ? "Ktoś dotrwał nieostrzyżony do końca czasu" : "Wszyscy ostrzyżeni" };
  }
  return null;
}
