import {
  BACK_CELLS, BASE_MOVE, ERS_BASE_CHARGE, ERS_BONUS, ERS_DRS_BONUS, ERS_MAX, FLAG_LEN, OFFLINE_PENALTY, PENALTY_PLACES, PIT_SPEED,
  DAMP_ROUNDS, NEUTRAL_ROUNDS, RAIN_ROUNDS, TOKEN_USES, WEAR_MAX, WORN_MOVE, type Rules,
} from "@/lib/boardgame/engine";

export type HelpKey =
  | "base" | "move" | "tyre" | "ers" | "pass" | "attack" | "block" | "slip" | "drs" | "line" | "corner"
  | "pitwall" | "vbox" | "flag" | "wet" | "brakes" | "damage" | "off" | "warn" | "penalty" | "push" | "pace"
  | "quick" | "bonus" | "pit" | "weather" | "sc" | "vsc";

/** คำอธิบายสั้นของศัพท์ในเกม — แตะชื่อบนหน้าจอแล้วขึ้นข้อความนี้ */
export function helpText(k: HelpKey, rules: Rules): { title: string; text: string } {
  const ours = rules === "ours";
  switch (k) {
    case "base":
      return { title: "BASE", text: `เดิน ${BASE_MOVE} ช่องแน่นอน ไม่สึกยาง — ปลอดภัย เหมาะตอนจะเข้าโค้งหรือยางใกล้หมด` };
    case "move":
      return {
        title: "ไพ่ MOVE",
        text: ours
          ? `เปิดไพ่ใบบนสุดของทีม ได้ระยะสุ่มตามยาง (เร็วกว่า BASE) บางใบทำยางสึก บางใบเปิดเหตุการณ์ (ACT) หรือแจกไพ่ PITWALL (PIT) — อยู่นอกเส้นแข่งระยะ −${OFFLINE_PENALTY}`
          : "เปิดไพ่ใบบนสุดของทีม ได้ระยะสุ่มตามยาง บางใบทำยางสึก บางใบเปิดเหตุการณ์ — ใช้ได้เฉพาะรถบนเส้นแข่ง (ยกเว้นตาแรก)",
      };
    case "tyre":
      return {
        title: "ยาง",
        text: `ไพ่ป้าย “สึก” ทำยางเสื่อม เหลือง 1 ขั้น แดง 2 ขั้น จาก ${WEAR_MAX} ขั้น หมดรางแล้วโดนอีกใบ = ยางพัง เดินเองช่องละ ${WORN_MOVE} ต้องเข้าพิท · ยางแดงเร็วกว่าแต่สึกไว`,
      };
    case "ers":
      return {
        title: "ERS",
        text: `แบตเสริม เลือกใช้หลังเปิดไพ่ +${ERS_BONUS} ช่อง${ours ? ` (ในโซน DRS +${ERS_DRS_BONUS})` : ""} มี ${ERS_MAX} ขั้น (ใช้ได้เมื่อมีอย่างน้อย 1) · ชาร์จคืน: ไพ่ MOVE รูปสายฟ้า +1${ours ? ` · เดิน BASE +${ERS_BASE_CHARGE}` : ""} (ตานั้นต้องไม่ได้ใช้ ERS) · ไพ่ PITWALL ชาร์จแบต +1`,
      };
    case "pass":
      return { title: "เหรียญแซง", text: `+1 ช่อง และลอดผ่านจุดที่รถขวางเต็มทางได้ 1 จุด ใช้ได้คันละ ${TOKEN_USES} ครั้ง` };
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
          ? `แต่ละช่องมี 2 เลน เลนในคือเส้นแข่ง อยู่นอกเส้นเปิดไพ่ MOVE ได้แต่ระยะ −${OFFLINE_PENALTY} ช่องเต็มสองเลนผ่านไม่ได้`
          : "แต่ละช่องมี 2 เลน เลนในคือเส้นแข่ง อยู่นอกเส้นเปิดไพ่ MOVE ไม่ได้ ได้แค่ BASE · ช่องเต็มสองเลนผ่านไม่ได้",
      };
    case "corner":
      return { title: "โค้ง", text: "ช่องสีแดงขอบแดงขาว — วิ่งเข้าโค้งแล้วต้องหยุดในโค้งก่อน ตาถัดไปค่อยออก เข้าโค้งก่อนคู่แข่งคือหัวใจของเกม" };
    case "pitwall":
      return { title: "ไพ่ PITWALL", text: "ไพ่กลยุทธ์ของทีม ใช้กับคันไหนก็ได้ตอนถึงตา ใช้แล้วทิ้ง ได้เพิ่มจากไพ่ MOVE ที่มีป้าย PIT — แตะไพ่เพื่อดูว่าทำอะไร" };
    case "vbox":
      return { title: "V-BOX", text: "ช่องกลางสนาม วิ่งผ่านแล้วซ่อมเบรกร้อนและรถเสียหายให้ฟรี ไม่ต้องเข้าพิท" };
    case "flag":
      return { title: "ธงเหลือง", text: `มีรถหลุดหรือเสียหาย — ${FLAG_LEN} ช่องนั้นได้แค่ BASE ห้ามไพ่ MOVE/ERS/เหรียญ หายเองเมื่อจบเทิร์นถัดไป` };
    case "wet":
      return { title: "ยางฝน", text: "ฝนตกใส่ยางฝนปลอดภัยกว่า (ไพ่แถวฝน) · แดดออกแล้วยังใส่ยางฝนได้แค่ BASE ต้องผ่าน V-BOX เพื่อเปลี่ยนกลับ" };
    case "brakes":
      return { title: "เบรกร้อน", text: "ได้แค่ BASE จนกว่าจะผ่าน V-BOX หรือเข้าพิท" };
    case "damage":
      return { title: "รถเสียหาย", text: `เดินเองช่องละ ${WORN_MOVE} ใช้ไพ่/เหรียญไม่ได้ จนกว่าจะผ่าน V-BOX หรือเข้าพิท` };
    case "off":
      return { title: "ข้างสนาม", text: "หลุดออกไปนอกแทร็ก ตาหน้ากลับเข้าสนามได้ถ้าช่องข้าง ๆ ว่าง (กลับแล้วจบตา)" };
    case "warn":
      return { title: "ใบเตือน", text: "ออกนอกขอบสนาม — โดนอีกใบจะกลายเป็นโทษ" };
    case "penalty":
      return { title: "โทษ", text: `เข้าพิทครั้งหน้าต้องจอดเพิ่ม 1 ตา ถ้าไม่ชดใช้จนจบเรซ ถอย ${PENALTY_PLACES} อันดับ` };
    case "push":
      return { title: "โหมด PUSH", text: "วิ่งเท่าไพ่เร็วสุดทุกตา แต่ยางสึกทุกตา เลือก BASE เมื่อไรก็เลิกโหมด" };
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
    case "sc":
      return {
        title: "SAFETY CAR",
        text: `มีรถชนออก — รถทุกคันเรียงแถวตามรถนำร่อง ได้แค่ BASE และห้ามแซง ${NEUTRAL_ROUNDS} เทิร์น เทิร์นสุดท้ายขึ้น ENDING แล้วกลับมาแข่งเทิร์นถัดไป · เข้าพิทช่วงนี้เสียเวลาน้อย`,
      };
    case "vsc":
      return {
        title: "VSC (เซฟตี้คาร์เสมือน)",
        text: `มีรถเสียหาย — ทุกคันได้แค่ BASE ห้ามไพ่ MOVE/ERS/เหรียญ ${NEUTRAL_ROUNDS} เทิร์น เทิร์นสุดท้ายขึ้น ENDING`,
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
