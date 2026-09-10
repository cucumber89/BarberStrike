import { expect, it } from "vitest";
import { boxFrom, type LightHint } from "@frankibarber/shared";
import { selectPracticals } from "./lightBudget";
it("reserves global slots and chooses nearby practicals ahead of distant list entries", () => {
  const lights: LightHint[] = Array.from({length:45},(_,i)=>({kind:"point",x:i,y:3,z:0,range:12,intensity:20,color:"#ffffff"}));
  const box = boxFrom(38,0,0,2,3,2);
  const chosen = selectPracticals(box,lights,3);
  expect(chosen).toHaveLength(3);
  expect(chosen.every(i=>i>=38 && i<=40)).toBe(true);
  expect(selectPracticals(box,lights,0)).toEqual([]);
  expect(selectPracticals(boxFrom(100,0,0,1,1,1),lights,3)).toEqual([]);
});
