import {
  BACK_CELLS, BASE_MOVE, DEFEND_ERS, DEFEND_EXTRA, FAST_CORNER_COST, FRESH_TURNS, TOW, PASS_NEED, PASS_NEED_DRS, SLOW_CORNER_COST, ERS_BASE_CHARGE, ERS_BONUS, ERS_DRS_BONUS, ERS_MAX, FLAG_LEN, OFFLINE_PENALTY, PENALTY_PLACES, PIT_SPEED,
  DAMP_ROUNDS, NEUTRAL_ROUNDS, RAIN_ROUNDS, WEAR_MAX, WORN_MOVE, type Rules,
} from "@/lib/boardgame/engine";

export type HelpKey =
  | "base" | "move" | "tyre" | "ers" | "pass" | "attack" | "block" | "slip" | "drs" | "line" | "corner"
  | "pitwall" | "vbox" | "flag" | "wet" | "brakes" | "damage" | "off" | "warn" | "penalty" | "push" | "pace"
  | "quick" | "bonus" | "pit" | "weather" | "sc" | "vsc" | "tow" | "fresh" | "defend";

/** คำอธิบายสั้นของศัพท์ในเกม — แตะชื่อบนหน้าจอแล้วขึ้นข้อความนี้ */
export function helpText(k: HelpKey, rules: Rules): { title: string; text: string } {
  const ours = rules === "ours";
  switch (k) {
    case "base":
      return {
        title: "SAVE",
        text: ours
          ? `เดิน ${BASE_MOVE} ช่องแน่นอน ไม่สึกยาง และโค้งไม่หักระยะ — ปลอดภัย เหมาะตอนจะผ่านโค้งหรือยางใกล้หมด`
          : `เดิน ${BASE_MOVE} ช่องแน่นอน ไม่สึกยาง — ปลอดภัย เหมาะตอนจะเข้าโค้งหรือยางใกล้หมด`,
      };
    case "move":
      return {
        title: "ไพ่ FLAT OUT",
        text: ours
          ? `เปิดไพ่ใบบนสุดของทีม ได้ระยะสุ่มตามยาง (เร็วกว่า SAVE) บางใบทำยางสึก บางใบเปิดเหตุการณ์ (ACT) — อยู่นอกเส้นแข่งระยะ −${OFFLINE_PENALTY}`
          : "เปิดไพ่ใบบนสุดของทีม ได้ระยะสุ่มตามยาง บางใบทำยางสึก บางใบเปิดเหตุการณ์ — ใช้ได้เฉพาะรถบนเส้นแข่ง (ยกเว้นตาแรก)",
      };
    case "tyre":
      return {
        title: "ยาง",
        text: `ไพ่ป้าย “สึก” ทำยางเสื่อม Medium (M) 1 ขั้น Soft (S) 2 ขั้น จาก ${WEAR_MAX} ขั้น หมดรางแล้วโดนอีกใบ = ยางพัง เดินเองช่องละ ${WORN_MOVE} ต้องเข้าพิท · ยาง S เร็วกว่าแต่สึกไว ยาง M ช้ากว่าแต่ทน`,
      };
    case "ers":
      return {
        title: "ERS",
        text: `แบตเสริม เลือกใช้หลังเปิดไพ่ +${ERS_BONUS} ช่อง${ours ? ` (ในโซน DRS +${ERS_DRS_BONUS})` : ""} มี ${ERS_MAX} ขั้น (ใช้ได้เมื่อมีอย่างน้อย 1) · ชาร์จคืน: ไพ่ FLAT OUT รูปสายฟ้า +1${ours ? ` · เดิน SAVE +${ERS_BASE_CHARGE}` : ""} (ตานั้นต้องไม่ได้ใช้ ERS)${ours ? "" : " · ไพ่ PITWALL ชาร์จแบต +1"}`,
      };
    case "pass":
      return {
        title: "การแซง",
        text: `เดินถึงช่องหลังคันหน้าแล้วต้องเหลือระยะมากกว่า ${PASS_NEED} ช่อง (ทางตรง DRS มากกว่า ${PASS_NEED_DRS}) ถึงแซงผ่านได้ แล้ววิ่งต่อจนครบระยะ — แซงหลายคันเช็กทีละคัน รถจอดคู่นับเป็นคันเดียว · กด ERS เพิ่มแรงไว้แซงได้ · โค้งยังต้องหยุดเหมือนเดิม`,
      };
    case "attack":
      return { title: "ATTACK", text: "จบติดท้ายรถคันหน้าบนเส้นแข่ง และข้างมันว่าง → เข้าที่แทน ดันมันออกนอกเส้น" };
    case "block":
      return { title: "BLOCK", text: "ประกาศหลังเดิน คันที่เดินต่อจากเราแซงหรือขึ้นคู่ไม่ได้ ต้องหยุดหลังเรา" };
    case "slip":
      return { title: "SLIPSTREAM", text: "ถ้าตามติดคันหน้าในเลนเดียวกันตอนมันออกตัว ตามไปติดท้ายมันได้ฟรีโดยไม่เปิดไพ่" };
    case "drs":
      return {
        title: "DRS",
        text: ours
          ? `ทางตรงที่ทาสีขาว — กด ERS ในโซนนี้ได้ +${ERS_DRS_BONUS} แทน +${ERS_BONUS}`
          : "อยู่ในโซน DRS และมีรถติดหน้าในเลนเดียวกัน → ขึ้นไปอยู่หน้ามันแทนการเดินปกติ",
      };
    case "line":
      return {
        title: "เส้นแข่ง / นอกเส้น",
        text: ours
          ? `แต่ละช่องมี 2 เลน เลนในคือเส้นแข่ง อยู่นอกเส้นเปิดไพ่ FLAT OUT ได้แต่ระยะ −${OFFLINE_PENALTY} ช่องเต็มสองเลนผ่านไม่ได้`
          : "แต่ละช่องมี 2 เลน เลนในคือเส้นแข่ง อยู่นอกเส้นเปิดไพ่ FLAT OUT ไม่ได้ ได้แค่ SAVE · ช่องเต็มสองเลนผ่านไม่ได้",
      };
    case "corner":
      return ours
        ? {
            title: "โค้ง",
            text: `ไม่ต้องหยุดในโค้ง แต่ช่องโค้งกินแรงมากกว่า: ทางปกติช่องละ 1 · โค้งความเร็วสูง (แดงจาง ป้าย ×${FAST_CORNER_COST}) ช่องละ ${FAST_CORNER_COST} · โค้งความเร็วต่ำ (แดงเข้ม ป้าย ×${SLOW_CORNER_COST}) ช่องละ ${SLOW_CORNER_COST} — ระยะบนไพ่คือแรงที่ใช้ได้ · เดิน SAVE ไม่โดนโค้งหักระยะ`,
          }
        : { title: "โค้ง", text: "ช่องสีแดงขอบแดงขาว — วิ่งเข้าโค้งแล้วต้องหยุดในโค้งก่อน ตาถัดไปค่อยออก เข้าโค้งก่อนคู่แข่งคือหัวใจของเกม" };
    case "pitwall":
      return { title: "ไพ่ PITWALL", text: "ไพ่กลยุทธ์ของทีม ใช้กับคันไหนก็ได้ตอนถึงตา ใช้แล้วทิ้ง ได้เพิ่มจากไพ่ FLAT OUT ที่มีป้าย PIT — แตะไพ่เพื่อดูว่าทำอะไร" };
    case "vbox":
      return { title: "V-BOX", text: "ช่องกลางสนาม วิ่งผ่านแล้วซ่อมเบรกร้อนและรถเสียหายให้ฟรี ไม่ต้องเข้าพิท" };
    case "flag":
      return { title: "ธงเหลือง", text: `มีรถหลุดหรือเสียหาย — ${FLAG_LEN} ช่องนั้นได้แค่ SAVE ห้ามไพ่ FLAT OUT/ERS/เหรียญ หายเองเมื่อจบเทิร์นถัดไป` };
    case "wet":
      return { title: "ยางฝน", text: "ฝนตกใส่ยางฝนปลอดภัยกว่า (ไพ่แถวฝน) · แดดออกแล้วยังใส่ยางฝนได้แค่ SAVE ต้องผ่าน V-BOX เพื่อเปลี่ยนกลับ" };
    case "brakes":
      return { title: "เบรกร้อน", text: "ได้แค่ SAVE จนกว่าจะผ่าน V-BOX หรือเข้าพิท" };
    case "damage":
      return { title: "รถเสียหาย", text: `เดินเองช่องละ ${WORN_MOVE} ใช้ไพ่/เหรียญไม่ได้ จนกว่าจะผ่าน V-BOX หรือเข้าพิท` };
    case "off":
      return { title: "ข้างสนาม", text: "หลุดออกไปนอกแทร็ก ตาหน้ากลับเข้าสนามได้ถ้าช่องข้าง ๆ ว่าง (กลับแล้วจบตา)" };
    case "warn":
      return { title: "ใบเตือน", text: "ออกนอกขอบสนาม — โดนอีกใบจะกลายเป็นโทษ" };
    case "penalty":
      return { title: "โทษ", text: `เข้าพิทครั้งหน้าต้องจอดเพิ่ม 1 ตา ถ้าไม่ชดใช้จนจบเรซ ถอย ${PENALTY_PLACES} อันดับ` };
    case "push":
      return { title: "โหมด PUSH", text: "วิ่งเท่าไพ่เร็วสุดทุกตา แต่ยางสึกทุกตา เลือก SAVE เมื่อไรก็เลิกโหมด" };
    case "pace":
      return { title: "โหมด PACE", text: "วิ่งระยะคงที่ไม่สึกยาง ถ้าวิ่งไม่ครบระยะ (ติดโค้ง/ติดรถ) โหมดจบทันที" };
    case "quick":
      return { title: "พิทสต็อปเร็ว", text: "ถึงช่องพิทแล้วเปลี่ยนยางออกได้ในตาเดียว ไม่ต้องจอดรอ" };
    case "bonus":
      return { title: "ทีมเวิร์ก", text: "ตานี้ได้ระยะเพิ่ม" };
    case "pit":
      return {
        title: "พิท",
        text: `ติ๊ก “จะเข้าพิท” ก่อนถึงโซนเข้าพิท รถจะหยุดในโซน ตาถัดไปเข้าเลนพิท (ช่องละ ${PIT_SPEED}) ถึงช่องพิทจอด ตาหน้าเปลี่ยนยางแล้ววิ่งออก`,
      };
    case "tow":
      return {
        title: "สลิปสตรีม / อากาศปั่นป่วน",
        text: `จบตาติดท้ายคันหน้าในเลนเดียวกัน: ถ้าอยู่บนทางตรง ตาหน้าได้แรง +${TOW} (สลิปสตรีม) ถ้าอยู่ในโค้ง ตาหน้าแรง −${TOW} (อากาศปั่นป่วน)`,
      };
    case "fresh":
      return { title: "ยางใหม่", text: `ออกจากพิทด้วยยางชุดใหม่ ${FRESH_TURNS} ตาแรกได้แรง +1 — เข้าพิทก่อนคู่แข่งเพื่อแซงตอนเขาเข้าพิท (undercut)` };
    case "defend":
      return { title: "ปิดไลน์", text: `กดหลังเปิดไพ่ ใช้ ERS ${DEFEND_ERS} ขั้น คันที่จะแซงเราต้องเหลือแรงมากขึ้นอีก ${DEFEND_EXTRA} จนกว่าเราจะเดินตาถัดไป` };
    case "sc":
      return {
        title: "SAFETY CAR",
        text: `มีรถชนออก — รถทุกคันเรียงแถวตามรถนำร่อง ได้แค่ SAVE และห้ามแซง ${NEUTRAL_ROUNDS} เทิร์น เทิร์นสุดท้ายขึ้น ENDING แล้วกลับมาแข่งเทิร์นถัดไป · เข้าพิทช่วงนี้เสียเวลาน้อย`,
      };
    case "vsc":
      return {
        title: "VSC (เซฟตี้คาร์เสมือน)",
        text: `มีรถเสียหาย — ทุกคันได้แค่ SAVE ห้ามไพ่ FLAT OUT/ERS/เหรียญ ${NEUTRAL_ROUNDS} เทิร์น เทิร์นสุดท้ายขึ้น ENDING`,
      };
    case "weather":
      return {
        title: "อากาศ",
        text: ours
          ? `แดด → เมฆ → ฝน → ทางหมาด → แดด เลื่อนได้จากไพ่เหตุการณ์และไพ่เรดาร์ ฝนตก ${RAIN_ROUNDS} เทิร์น แล้วทางหมาด ${DAMP_ROUNDS} เทิร์น · ยางแห้งในฝน −2 (บางใบหมุน) ทางหมาด −1 · ยางฝนใช้แถวฝนเสมอ เปลี่ยนยางที่ V-BOX หรือพิท`
          : "มาตร 6 ขั้น ขั้น 5–6 ฝนตก เลยขั้นสุดท้ายวนกลับแดดออก",
      };
  }
}

/** ใช้ใน logText ของกติกาของเรา */
export const BACK_TEXT = `ถอย ${BACK_CELLS} ช่อง`;
