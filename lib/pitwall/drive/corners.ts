/**
 * ชื่อโค้งดังของแต่ละสนาม (ระยะเป็นเมตรจากเส้นสตาร์ทตามเส้นกลาง — ตรงกับข้อมูลสนามจริงใน tracks/)
 * ตำแหน่งได้จากการหาโค้งในผังจริงแล้วเทียบกับผังสนามที่รู้จัก · ใช้ชื่อโค้งทั่วไป ไม่ใช้ชื่อที่เป็นชื่อสปอนเซอร์ (ใช้เลขโค้งแทน)
 * bank = องศาถนนเอียงเข้าด้านในโค้ง (โค้งเอียงของซานด์วูร์ต)
 */
export type Corner = { from: number; to: number; name: string; bank?: number };

export const CORNERS: Record<string, Corner[]> = {
  spa: [
    { from: 360, to: 432, name: "La Source" },
    { from: 1048, to: 1080, name: "Eau Rouge" },
    { from: 1120, to: 1316, name: "Raidillon" },
    { from: 2392, to: 2548, name: "Les Combes" },
    { from: 2620, to: 2704, name: "Malmedy" },
    { from: 2984, to: 3164, name: "Rivage" },
    { from: 3264, to: 3352, name: "Bruxelles" },
    { from: 3784, to: 4148, name: "Pouhon" },
    { from: 4456, to: 4736, name: "Les Fagnes" },
    { from: 4916, to: 5008, name: "Campus" },
    { from: 5116, to: 5244, name: "Stavelot" },
    { from: 6152, to: 6244, name: "Blanchimont" },
    { from: 6724, to: 6844, name: "Bus Stop" },
  ],
  monza: [
    { from: 912, to: 1004, name: "Variante del Rettifilo" },
    { from: 1300, to: 1800, name: "Curva Grande" },
    { from: 2124, to: 2212, name: "Variante della Roggia" },
    { from: 2496, to: 2628, name: "Lesmo 1" },
    { from: 2856, to: 2916, name: "Lesmo 2" },
    { from: 3936, to: 4172, name: "Variante Ascari" },
    { from: 5120, to: 5432, name: "Curva Parabolica" },
  ],
  silverstone: [
    { from: 380, to: 460, name: "Abbey" },
    { from: 588, to: 684, name: "Farm" },
    { from: 860, to: 936, name: "Village" },
    { from: 1008, to: 1104, name: "The Loop" },
    { from: 1220, to: 1276, name: "Aintree" },
    { from: 1904, to: 2044, name: "Brooklands" },
    { from: 2096, to: 2304, name: "Luffield" },
    { from: 2444, to: 2612, name: "Woodcote" },
    { from: 3020, to: 3164, name: "Copse" },
    { from: 3604, to: 3676, name: "Maggotts" },
    { from: 3692, to: 3940, name: "Becketts" },
    { from: 3960, to: 4100, name: "Chapel" },
    { from: 4972, to: 5164, name: "Stowe" },
    { from: 5496, to: 5552, name: "Vale" },
    { from: 5560, to: 5804, name: "Club" },
  ],
  suzuka: [
    { from: 660, to: 928, name: "First Curve" },
    { from: 1080, to: 1828, name: "S Curves" },
    { from: 1888, to: 2116, name: "Dunlop" },
    { from: 2280, to: 2324, name: "Degner 1" },
    { from: 2428, to: 2484, name: "Degner 2" },
    { from: 2880, to: 2976, name: "Hairpin" },
    { from: 3148, to: 3232, name: "200R" },
    { from: 3776, to: 4088, name: "Spoon" },
    { from: 4948, to: 5008, name: "130R" },
    { from: 5368, to: 5476, name: "Chicane" },
    { from: 5496, to: 5664, name: "Final Curve" },
  ],
  interlagos: [
    { from: 284, to: 488, name: "S do Senna" },
    { from: 532, to: 760, name: "Curva do Sol" },
    { from: 1372, to: 1468, name: "Descida do Lago" },
    { from: 1996, to: 2224, name: "Ferradura" },
    { from: 2296, to: 2392, name: "Laranjinha" },
    { from: 2404, to: 2560, name: "Pinheirinho" },
    { from: 2716, to: 2808, name: "Bico de Pato" },
    { from: 2884, to: 3068, name: "Mergulho" },
    { from: 3224, to: 3308, name: "Juncao" },
    { from: 3368, to: 3736, name: "Subida dos Boxes" },
  ],
  zandvoort: [
    { from: 344, to: 484, name: "Tarzan" },
    { from: 696, to: 776, name: "Gerlach" },
    { from: 840, to: 976, name: "Hugenholtz", bank: 18 },
    { from: 1304, to: 1384, name: "Hunserug" },
    { from: 1476, to: 1560, name: "Rob Slotemaker" },
    { from: 1676, to: 1888, name: "Scheivlak" },
    { from: 3160, to: 3328, name: "Hans Ernst" },
    { from: 3744, to: 3996, name: "Arie Luyendyk", bank: 17 },
  ],
  americas: [
    { from: 588, to: 696, name: "Turn 1" },
    { from: 836, to: 1628, name: "Esses" },
    { from: 2556, to: 2636, name: "Turn 11" },
    { from: 3760, to: 3820, name: "Turn 12" },
    { from: 4488, to: 4860, name: "Turns 16-18" },
    { from: 5320, to: 5388, name: "Turn 20" },
  ],
  bahrain: [
    { from: 712, to: 772, name: "Turn 1" },
    { from: 1508, to: 1604, name: "Turn 4" },
    { from: 2232, to: 2324, name: "Turn 8" },
    { from: 2592, to: 2764, name: "Turns 9-10" },
    { from: 3424, to: 3668, name: "Turn 11" },
    { from: 4904, to: 5036, name: "Turn 15" },
  ],
  hungaroring: [
    { from: 596, to: 692, name: "Turn 1" },
    { from: 1084, to: 1232, name: "Turn 2" },
    { from: 1996, to: 2152, name: "Turn 5" },
    { from: 2364, to: 2452, name: "Turns 6-7" },
    { from: 3512, to: 3576, name: "Turn 12" },
    { from: 3732, to: 3880, name: "Turn 13" },
    { from: 3996, to: 4208, name: "Turn 14" },
  ],
  catalunya: [
    { from: 804, to: 976, name: "Turns 1-2" },
    { from: 1056, to: 1336, name: "Turn 3" },
    { from: 1668, to: 1912, name: "Turn 4" },
    { from: 2076, to: 2192, name: "Turn 5" },
    { from: 2844, to: 2984, name: "Turn 9" },
    { from: 3448, to: 3528, name: "Turn 10" },
    { from: 4276, to: 4416, name: "Final Corner" },
  ],
  albert_park: [
    { from: 356, to: 560, name: "Turns 1-2" },
    { from: 1080, to: 1140, name: "Turn 3" },
    { from: 1876, to: 2024, name: "Turn 6" },
    { from: 3340, to: 3508, name: "Turns 11-12" },
    { from: 4660, to: 4896, name: "Final Chicane" },
  ],
};

export const cornersOf = (id: string) => CORNERS[id] ?? [];

/** โค้งที่กำลังจะถึงหรืออยู่ในโค้ง (มองล่วงหน้า ahead เมตร) · d = ระยะในรอบ */
export function cornerAhead(id: string, d: number, length: number, ahead = 220): Corner | null {
  for (const c of cornersOf(id)) {
    const toStart = (((c.from - d) % length) + length) % length;
    if (toStart <= ahead || (d >= c.from && d <= c.to)) return c;
  }
  return null;
}
