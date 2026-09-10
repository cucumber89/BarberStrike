import type { MaterialTag } from "@frankibarber/shared";

/** Metres from anchor minX / top / minZ. Roof furniture stays on closed roofs; the loading
 * stack and mezzanine get thin relief, preserving their traversable top surfaces.
 * Structural dimensions use .25 m, smaller detail .1 m and trim .05 m.
 */
export type LandmarkPiece = [number,number,number,number,number,number,MaterialTag,("cylinder"|"box")?,number?];
export interface DistrictLandmark { area: string; anchor: string; purpose: string; pieces: LandmarkPiece[] }
export const DISTRICT_LANDMARKS: DistrictLandmark[] = [];

DISTRICT_LANDMARKS.push({
  "area": "west_yard",
  "anchor": "north_facade",
  "purpose": "Three stepped district-heating flues terminate the empty service corridor.",
  "pieces": [
    [
      4.25,
      0.125,
      0.15,
      4,
      0.25,
      1,
      "metal"
    ],
    [
      3,
      1,
      0.15,
      0.75,
      1.75,
      0.75,
      "paint_blue",
      "cylinder"
    ],
    [
      4.5,
      1.5,
      0.15,
      0.75,
      2.75,
      0.75,
      "paint_blue",
      "cylinder"
    ],
    [
      6,
      1.25,
      0.15,
      0.75,
      2.25,
      0.75,
      "paint_blue",
      "cylinder"
    ],
    [
      3,
      1.9,
      0.15,
      1,
      0.1,
      1,
      "paint_white",
      "cylinder"
    ],
    [
      4.5,
      2.9,
      0.15,
      1,
      0.1,
      1,
      "paint_white",
      "cylinder"
    ],
    [
      6,
      2.4,
      0.15,
      1,
      0.1,
      1,
      "paint_white",
      "cylinder"
    ]
  ]
});

DISTRICT_LANDMARKS.push({area:"west_extension",anchor:"depot_roof",purpose:"Stepped workshop monitor",pieces:[[5.75,.125,6,8,.25,4,"paint_red"],[3,.75,6,2.5,1,3.5,"paint_red"],[5.5,1,6,2.5,1.5,3.5,"paint_red"],[8,1.25,6,2.5,2,3.5,"paint_red"],[3,1.3,6,2.5,.1,3.5,"paint_white"],[5.5,1.8,6,2.5,.1,3.5,"paint_white"],[8,2.3,6,2.5,.1,3.5,"paint_white"]]});

DISTRICT_LANDMARKS.push({area:"east_extension",anchor:"cafe_roof",purpose:"Octagonal cafe cup with open handle",pieces:[[6,.125,5,4,.25,3.5,"paint_green"],[6,1,5,2.5,1.5,2.5,"paint_white","cylinder"],[6,1.8,5,2.75,.1,2.75,"brass","cylinder"],[7.75,1.5,5,1.25,.25,.25,"paint_white"],[8.25,1,5,.25,1.25,.25,"paint_white"],[7.75,.5,5,1.25,.25,.25,"paint_white"]]});

DISTRICT_LANDMARKS.push({area:"north",anchor:"cabin_w",purpose:"Dispatch clock tower",pieces:[[3,.125,2,2,.25,2,"paint_blue"],[3,1.25,2,1.5,2,1.5,"paint_blue"],[3,2.35,2,2,.2,2,"paint_yellow"],[3,1.5,1.2,1,.75,.1,"paint_white"],[3,1.5,1.1,.1,.5,.1,"metal"],[3.2,1.5,1.1,.4,.1,.1,"metal"]]});

DISTRICT_LANDMARKS.push({area:"street",anchor:"shelter_roof",purpose:"Three rising night-bus fins",pieces:[[.75,.5,1,.5,1,1.5,"paint_yellow"],[1.5,.75,1,.5,1.5,1.5,"paint_yellow"],[2.25,1,1,.5,2,1.5,"paint_yellow"],[2.75,.1,1,5.5,.2,2,"metal"]]});

DISTRICT_LANDMARKS.push({area:"backlot",anchor:"garage_roof",purpose:"Open-jaw repair spanner",pieces:[[6.5,.125,2,3,.25,1.5,"paint_blue"],[6.5,1.125,2,.75,1.75,.5,"paint_yellow"],[6.5,2,2,2,.5,.5,"paint_yellow"],[5.75,2.5,2,.5,.75,.5,"paint_yellow"],[7.25,2.5,2,.5,.75,.5,"paint_yellow"]]});

DISTRICT_LANDMARKS.push({area:"alley",anchor:"alley_annex",purpose:"Bent extraction duct",pieces:[[4,.125,2,2,.25,2,"metal"],[4,1,2,1.25,1.75,1.25,"paint_green"],[4.5,1.75,2,2.25,.5,1.25,"paint_green"],[5.65,1.75,2,.1,.5,1.25,"paint_yellow"]]});

DISTRICT_LANDMARKS.push({area:"shop",anchor:"shop_ceiling",purpose:"Faceted barber pole",pieces:[[2,.125,2,1.5,.25,1.5,"metal"],[2,.75,2,1,1,1,"paint_red","cylinder"],[2,1.5,2,1,.5,1,"paint_white","cylinder"],[2,2,2,1,.5,1,"paint_blue","cylinder"],[2,2.5,2,1,.5,1,"paint_white","cylinder"],[2,2.85,2,1.5,.2,1.5,"brass","cylinder"]]});

DISTRICT_LANDMARKS.push({area:"unit",anchor:"industrial_ceiling",purpose:"Broad exhaust hood",pieces:[[6,.125,4,4,.25,4,"metal"],[6,.75,4,2.5,1,2.5,"paint_blue","cylinder"],[6,1.4,4,4,.3,4,"paint_yellow","cylinder"],[6,1.8,4,3,.5,3,"metal","cylinder"]]});

DISTRICT_LANDMARKS.push({area:"hall",anchor:"hall_ceiling",purpose:"Laundry clerestory fins",pieces:[[5,.25,5,5,.5,2,"paint_green"],[3.5,.9,5,.25,1,2,"paint_white"],[5,.9,5,.25,1,2,"paint_white"],[6.5,.9,5,.25,1,2,"paint_white"]]});

DISTRICT_LANDMARKS.push({area:"storage",anchor:"mezzanine_rail",purpose:"Stepped mezzanine relief keeps the deck clear",pieces:[[1,-.1,.1,2,.2,.1,"paint_yellow"],[4,-.35,.1,2,.2,.1,"paint_yellow"],[7,-.6,.1,2,.2,.1,"paint_yellow"],[10,-.85,.1,1,.2,.1,"paint_yellow"]]});

DISTRICT_LANDMARKS.push({area:"east",anchor:"cw_roof",purpose:"Twin wash-water tanks",pieces:[[5,.125,5,6,.25,3,"metal"],[3.5,1.25,5,2,2,2,"paint_blue","cylinder"],[6.5,1.25,5,2,2,2,"paint_blue","cylinder"],[3.5,2.35,5,2.25,.2,2.25,"paint_white","cylinder"],[6.5,2.35,5,2.25,.2,2.25,"paint_white","cylinder"],[5,1.75,5,1.25,.25,.25,"metal"]]});
