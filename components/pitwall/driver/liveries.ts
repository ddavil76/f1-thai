/**
 * ลิเวอรีของทีมในเกม (แต่งขึ้นเองทั้งหมด) — ใช้สีประจำทีมในเกมเป็นหลัก แต่ลวดลายและ "สปอนเซอร์" เป็นชื่อสมมติ
 * ไม่ลอกลายหรือโลโก้ของทีม/แบรนด์จริง · ชื่อสปอนเซอร์เป็นคำที่ตั้งขึ้นใหม่ ไม่ใช่ยี่ห้อที่มีอยู่จริง
 * วาดลงบน canvas เป็นพื้นผิวของตัวถัง/sidepod/ปีก (ไม่ต้องโหลดรูป)
 */

export type Pattern = "sweep" | "band" | "stripes" | "chevron" | "split" | "fade";
export type LogoStyle = "box" | "swoosh" | "ring" | "slant";

export type Design = {
  /** สีหลัก / สีรอง / สีเน้น */
  base: string;
  second: string;
  accent: string;
  /** สีตัวอักษรบนพื้นสีหลัก */
  ink: string;
  pattern: Pattern;
  /** [สปอนเซอร์หลัก, รอง 1, รอง 2] */
  sponsors: [string, string, string];
  styles: [LogoStyle, LogoStyle, LogoStyle];
};

export const DESIGNS: Record<string, Design> = {
  papaya: {
    base: "#FF8000",
    second: "#14161a",
    accent: "#3fd0ff",
    ink: "#14161a",
    pattern: "sweep",
    sponsors: ["ORBYX", "KINETRA", "NOVALUME"],
    styles: ["ring", "slant", "box"],
  },
  bull: {
    base: "#1b2a55",
    second: "#3671C6",
    accent: "#ffcf1f",
    ink: "#ffffff",
    pattern: "band",
    sponsors: ["VOLTANE", "SKYLUME", "RAPTEX"],
    styles: ["box", "swoosh", "slant"],
  },
  silver: {
    base: "#c7ccd3",
    second: "#0f1114",
    accent: "#27F4D2",
    ink: "#0f1114",
    pattern: "fade",
    sponsors: ["ARGENTA", "QUORIX", "HELVANE"],
    styles: ["slant", "ring", "box"],
  },
  rosso: {
    base: "#E8002D",
    second: "#ffffff",
    accent: "#ffd400",
    ink: "#ffffff",
    pattern: "stripes",
    sponsors: ["FIAMMO", "SOLVIA", "MARENTO"],
    styles: ["swoosh", "box", "ring"],
  },
  green: {
    base: "#0b5e45",
    second: "#062e22",
    accent: "#d7f23c",
    ink: "#ffffff",
    pattern: "chevron",
    sponsors: ["VERDEX", "AURIXA", "LUMORA"],
    styles: ["ring", "slant", "swoosh"],
  },
  grove: {
    base: "#1868DB",
    second: "#0a1a3a",
    accent: "#00d4ff",
    ink: "#ffffff",
    pattern: "split",
    sponsors: ["BLUVANE", "TERRAXA", "NIMBRA"],
    styles: ["slant", "box", "ring"],
  },
  stripe: {
    base: "#e9ebee",
    second: "#15171b",
    accent: "#E10600",
    ink: "#15171b",
    pattern: "band",
    sponsors: ["MAKORA", "STRIVO", "KORVEX"],
    styles: ["box", "ring", "slant"],
  },
};

/** ทีมที่ไม่มีในรายการ (เช่นรถเงา) ใช้แบบเรียบตามสีที่ส่งมา */
export function designOf(team: string, colour: string, ink: string): Design {
  return (
    DESIGNS[team] ?? {
      base: colour,
      second: "#14161a",
      accent: "#ffffff",
      ink,
      pattern: "sweep",
      sponsors: ["", "", ""],
      styles: ["box", "box", "box"],
    }
  );
}

const FONT = "'Archivo', 'Arial Black', 'Helvetica Neue', sans-serif";

/**
 * โลโก้สปอนเซอร์สมมติ กึ่งกลางที่ (0, 0) กว้างประมาณ w สูง h (ผู้เรียกเลื่อน/หมุน canvas เอง)
 */
export function drawLogo(g: CanvasRenderingContext2D, name: string, w: number, h: number, style: LogoStyle, fg: string, bg: string) {
  if (!name) return;
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  const fit = (size: number, weight = "900", italic = true) => {
    let s = size;
    do {
      g.font = `${italic ? "italic " : ""}${weight} ${s}px ${FONT}`;
      s -= 2;
    } while (g.measureText(name).width > w * 0.86 && s > 8);
  };
  if (style === "box") {
    // กล่องทึบ ตัวอักษรสีพื้น
    g.fillStyle = fg;
    g.fillRect(-w / 2, -h / 2, w, h);
    fit(h * 0.72, "900", false);
    g.fillStyle = bg;
    g.fillText(name, 0, h * 0.04);
  } else if (style === "ring") {
    // วงกลมสัญลักษณ์ + ชื่อ
    const r = h * 0.42;
    g.strokeStyle = fg;
    g.lineWidth = h * 0.1;
    g.beginPath();
    g.arc(-w / 2 + r + 2, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(-w / 2 + r + 2, 0, r * 0.35, 0, Math.PI * 2);
    g.fillStyle = fg;
    g.fill();
    g.translate(r, 0);
    const keepW = w;
    w = keepW - r * 2.4;
    fit(h * 0.66, "800", false);
    g.fillText(name, 0, h * 0.04);
  } else if (style === "swoosh") {
    // ชื่อเอียง + เส้นโค้งใต้ชื่อ
    fit(h * 0.6);
    g.fillStyle = fg;
    g.fillText(name, 0, -h * 0.08);
    g.lineWidth = h * 0.09;
    g.strokeStyle = fg;
    g.beginPath();
    g.moveTo(-w * 0.42, h * 0.3);
    g.quadraticCurveTo(0, h * 0.5, w * 0.44, h * 0.18);
    g.stroke();
  } else {
    // ตัวหนาเอียง + เส้นความเร็ว
    fit(h * 0.74);
    g.fillStyle = fg;
    g.fillText(name, w * 0.06, h * 0.04);
    for (let k = 0; k < 3; k++) g.fillRect(-w / 2, -h * 0.22 + k * h * 0.2, w * 0.1 - k * w * 0.02, h * 0.08);
  }
  g.restore();
}

/** เลขรถ (สมมติ) ตัวเลขหนามีขอบ */
export function drawNumber(g: CanvasRenderingContext2D, num: number, size: number, fg: string, edge: string) {
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `italic 900 ${size}px ${FONT}`;
  g.lineWidth = size * 0.12;
  g.strokeStyle = edge;
  g.strokeText(String(num), 0, 0);
  g.fillStyle = fg;
  g.fillText(String(num), 0, 0);
  g.restore();
}

/**
 * ลวดลายพื้นของผิวที่ลากตามความยาวรถ (ตัวถัง/sidepod): แกน x ของ canvas = หน้า → ท้าย
 * แกน y: ล่างสุด = ใต้ท้อง, กลาง = หลังคา (ด้านขวาครึ่งล่างของ canvas · ด้านซ้ายครึ่งบน)
 */
export function paintBody(g: CanvasRenderingContext2D, W: number, H: number, d: Design, part: "tub" | "pod") {
  g.fillStyle = d.base;
  g.fillRect(0, 0, W, H);
  // ทั้งสองฝั่งพร้อมกัน: วาดฝั่งขวา (ครึ่งล่าง) แล้วสะท้อนขึ้นครึ่งบน
  const side = (draw: () => void) => {
    g.save();
    draw();
    g.restore();
    g.save();
    g.translate(0, H);
    g.scale(1, -1);
    draw();
    g.restore();
  };
  const y = (v: number) => H * (1 - v); // v = 0 ใต้ท้อง · 0.25 ข้าง · 0.5 หลังคา
  switch (d.pattern) {
    case "sweep":
      side(() => {
        g.fillStyle = d.second;
        g.beginPath();
        g.moveTo(W * 0.2, y(0));
        g.bezierCurveTo(W * 0.45, y(0.05), W * 0.6, y(0.3), W, y(part === "pod" ? 0.38 : 0.34));
        g.lineTo(W, y(0));
        g.closePath();
        g.fill();
        g.fillStyle = d.accent;
        g.fillRect(W * 0.05, y(0.2), W * 0.4, H * 0.012);
      });
      break;
    case "band":
      side(() => {
        g.fillStyle = d.second;
        g.fillRect(0, y(0.12), W, H * 0.07);
        g.fillStyle = d.accent;
        g.fillRect(0, y(0.05), W, H * 0.025);
      });
      if (part === "tub") {
        g.fillStyle = d.accent;
        g.fillRect(0, H * 0.5 - H * 0.02, W * 0.4, H * 0.04);
      }
      break;
    case "stripes":
      side(() => {
        g.fillStyle = d.second;
        g.fillRect(0, y(0.3), W, H * 0.012);
        g.fillRect(0, y(0.27), W, H * 0.006);
        g.fillStyle = "#14161a";
        g.fillRect(0, y(0.08), W, H * 0.08);
      });
      break;
    case "chevron":
      side(() => {
        g.fillStyle = d.second;
        g.fillRect(0, y(0.1), W, H * 0.1);
      });
      g.fillStyle = d.accent;
      for (let k = 0; k < 4; k++) {
        const x0 = W * (0.05 + k * 0.07);
        g.beginPath();
        g.moveTo(x0, H * 0.5 - H * 0.12);
        g.lineTo(x0 + W * 0.04, H * 0.5);
        g.lineTo(x0, H * 0.5 + H * 0.12);
        g.lineTo(x0 + W * 0.015, H * 0.5 + H * 0.12);
        g.lineTo(x0 + W * 0.055, H * 0.5);
        g.lineTo(x0 + W * 0.015, H * 0.5 - H * 0.12);
        g.closePath();
        g.fill();
      }
      break;
    case "split":
      side(() => {
        g.fillStyle = d.second;
        g.beginPath();
        g.moveTo(W * 0.52, y(0));
        g.lineTo(W * 0.68, y(0.5));
        g.lineTo(W, y(0.5));
        g.lineTo(W, y(0));
        g.closePath();
        g.fill();
        g.fillStyle = d.accent;
        g.beginPath();
        g.moveTo(W * 0.48, y(0));
        g.lineTo(W * 0.64, y(0.5));
        g.lineTo(W * 0.66, y(0.5));
        g.lineTo(W * 0.5, y(0));
        g.closePath();
        g.fill();
      });
      break;
    case "fade": {
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, d.base);
      grad.addColorStop(0.45, d.base);
      grad.addColorStop(1, d.second);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      side(() => {
        g.fillStyle = d.accent;
        g.fillRect(0, y(0.17), W, H * 0.014);
      });
      break;
    }
  }
  // ใต้ท้องคาร์บอน
  g.fillStyle = "#15161a";
  g.fillRect(0, y(0.07), W, H * 0.07);
  g.fillRect(0, 0, W, H * 0.07);
}
