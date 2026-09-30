import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getCircuitWinners, getSchedule, getSessionWindows } from "@/lib/f1";
import { circuitTrack } from "@/lib/circuits";
import { SEASON } from "@/lib/season";
import {
  cardName, cardSessions, fitName, lastWinner, raceCountry, raceLaps,
  type CardSession, type CardSize, type CardTheme,
} from "@/lib/widget-card";

/*
 * รูปพื้นหลังของ widget (iPhone/Android) — ทุกอย่างยกเว้นกล่องนับถอยหลังมุมซ้ายล่าง
 * ที่ widget วาดทับเองด้วยฟอนต์ของเครื่อง (ต้องเดินได้ตรงเวลา) · มุมนั้นจึงเว้นว่างไว้
 *
 * /api/widget/card?round=16&size=medium&w=364&h=170&s=3&theme=light&next=FP1&tz=420
 * · w, h = ขนาด widget เป็น point/dp (รูปออกมาสัดส่วนเดียวกับ widget พอดี) · s = ความคมชัด
 * · next = session ถัดไป (ไฮไลต์ในตาราง) · live=1 = กำลังแข่ง · tz = เขตเวลาของเครื่อง (นาทีจาก UTC)
 * · layer=text|side = แยกเป็นสองชั้นพื้นใส (Android): text = ตัวหนังสือฝั่งซ้ายบน สูงเท่าเนื้อหา ·
 *   side = ธงหมากรุก + ผังสนาม (+ ผู้ชนะ) ชิดขวา — launcher บางยี่ห้อบอกขนาด widget คลาดจากจริง
 *   รูปเดียวเต็มกรอบจะถูกตัดขอบ แยกชั้นแล้วแต่ละชั้นยึดมุมของตัวเอง ย่อได้แต่ไม่ถูกตัด
 * ไม่มีโลโก้/ฟอนต์ของ F1 — ฟอนต์ Archivo + Chakra Petch (OFL) อยู่ใน assets/fonts
 */

const fonts = Promise.all(
  ["Archivo-SemiCondensedBlackItalic.ttf", "ChakraPetch-SemiBold.ttf", "ChakraPetch-Bold.ttf"].map((f) =>
    readFile(join(process.cwd(), "assets/fonts", f)),
  ),
);

const THEME = {
  light: { bg: "#f5f3ee", ink: "#1b1b22", dim: "#74737c", line: "rgba(27,27,34,0.16)", tex: null },
  dark: { bg: "#0e0e12", ink: "#f3f3f5", dim: "#9b9ba6", line: "rgba(255,255,255,0.16)", tex: "rgba(255,255,255,0.025)" },
} as const;
const RED = "#e10600";

const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** ผังสนาม: เส้นหนาสีหมึก + เส้นกลางสีพื้น + จุดสตาร์ทแดง */
function trackSvg(d: string, w: number, h: number, boxW: number, boxH: number, sw: number, ink: string, bg: string) {
  const vw = w + 12;
  const vh = h + 12;
  const k = Math.min(boxW / vw, boxH / vh); // point ต่อหน่วยของผัง
  const first = d.match(/M(-?[\d.]+),(-?[\d.]+)/);
  const [fx, fy] = first ? [Number(first[1]), Number(first[2])] : [0, 0];
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 ${vw} ${vh}" width="${boxW}" height="${boxH}" preserveAspectRatio="xMidYMid meet">` +
      `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${(sw * 2.3) / k}" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="${d}" fill="none" stroke="${bg}" stroke-width="${(sw * 0.7) / k}" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<circle cx="${fx}" cy="${fy}" r="${(sw * 1.9) / k}" fill="${RED}" stroke="${bg}" stroke-width="${(sw * 0.6) / k}"/>` +
      `</svg>`,
  );
}

/** ธงหมากรุกจาง ๆ มุมขวาบน ค่อย ๆ หายเข้าหากลาง */
function checkerSvg(size: number, ink: string, strength: number) {
  const c = 12;
  let rects = "";
  for (let y = 0; y < size; y += c)
    for (let x = 0; x < size; x += c) if (((x + y) / c) % 2 === 0) rects += `<rect x="${x}" y="${y}" width="${c}" height="${c}"/>`;
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<defs><linearGradient id="g" x1="1" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="${strength}"/><stop offset="0.35" stop-color="#fff" stop-opacity="${strength * 0.4}"/>` +
      `<stop offset="0.55" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<mask id="m"><rect width="${size}" height="${size}" fill="url(#g)"/></mask></defs>` +
      `<g fill="${ink}" mask="url(#m)">${rects}</g></svg>`,
  );
}

/** เส้นความเร็วใต้ชื่อ: แถบแดงเฉียงสามเส้น ยาว → สั้น จาง */
function streakSvg(h: number, lengths: [number, number, number]) {
  const slant = h * 1.4;
  let x = 0;
  const parts = lengths.map((len, i) => {
    const p = `<polygon points="${x + slant},0 ${x + slant + len},0 ${x + len},${h} ${x},${h}" fill="${RED}" fill-opacity="${[1, 0.7, 0.4][i]}"/>`;
    x += len + h * 0.8;
    return p;
  });
  return { uri: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${x + slant}" height="${h}">${parts.join("")}</svg>`), w: x + slant };
}

/** ลายคาร์บอนละเอียด (โหมดมืด) */
function carbonSvg(w: number, h: number, color: string) {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><pattern id="p" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="3" height="3" fill="${color}"/><rect x="3" y="3" width="3" height="3" fill="${color}"/></pattern></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#p)"/></svg>`,
  );
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const size: CardSize = q.get("size") === "small" ? "small" : q.get("size") === "large" ? "large" : "medium";
  const theme: CardTheme = q.get("theme") === "dark" ? "dark" : "light";
  const defaults = { small: [170, 170], medium: [364, 170], large: [364, 382] }[size];
  const W = clamp(Number(q.get("w")) || defaults[0], 100, 600);
  const H = clamp(Number(q.get("h")) || defaults[1], 100, 600);
  const s = clamp(Number(q.get("s")) || 2, 1, 3);
  const tzMin = clamp(Number(q.get("tz")) || 420, -720, 840);
  const next = q.get("next");
  const live = q.get("live") === "1";
  const layer = q.get("layer") === "text" ? "text" : q.get("layer") === "side" ? "side" : "full";

  const races = await getSchedule(SEASON).catch(() => []);
  const race = races.find((r) => r.round === q.get("round"));
  if (!race) return new Response("race not found", { status: 404 });

  const circuitId = race.Circuit.circuitId;
  const path = circuitTrack(circuitId);
  const [archivo, chakra6, chakra7] = await fonts;
  const winner = size === "large" ? lastWinner(await getCircuitWinners(circuitId)) : null;
  const sessions: CardSession[] = cardSessions(getSessionWindows(race), { next, live, tzMin });

  const T = THEME[theme];
  const u = (n: number) => n * s; // point → pixel
  const name = cardName(circuitId, race.Circuit.circuitName);
  const laps = path ? raceLaps(circuitId, path.length) : null;
  const chips = [
    path?.length ? `${(path.length / 1000).toFixed(3)} กม.` : null,
    laps ? `${laps} รอบ` : null,
    path?.firstGp ? `ตั้งแต่ ${path.firstGp}` : null,
  ].filter((c): c is string => !!c);

  const pad = size === "large" ? { t: 14, l: 16, r: 14 } : { t: 12, l: 15, r: 14 };
  // มุมซ้ายล่างเว้นให้กล่องนับถอยหลังที่ widget วาดเอง (สูงราว 52–58 + ขอบล่าง 12–14)
  const pillTop = H - (size === "large" ? 74 : 66);
  const trackW = ((size === "small" ? 56 : size === "medium" ? 132 : 158) * W) / (size === "small" ? 170 : 364);
  const nameWidth = size === "medium" ? W - pad.l - pad.r - trackW - 10 : W - pad.l - pad.r;
  const nameSize = fitName(name, nameWidth, size === "small" ? 36 : size === "medium" ? 38 : 64);
  // บนหัว: ขอบ + แถว R16 (~14) + ชื่อ + เส้นความเร็ว
  const headBottom = pad.t + 14 + 5 + nameSize * 0.9 + 5 + 4;
  // widget กลางที่เตี้ย (iPhone ส่วนใหญ่ ~158) ใส่ป้ายสถิติไม่พอ → ย้ายจำนวนรอบไปต่อท้ายแถวบน
  // ชั้น text ของ Android: ความสูงจริงเดาไม่ได้แน่ (launcher บอกคลาด) → แบบกลางใช้แถวบนแบบย่อเสมอ ชื่อจะได้ไม่ถูกย่อ
  const chipsFit =
    size === "large" || (size === "medium" && layer !== "text" && headBottom + 7 + 15 + 4 <= pillTop);
  const small = (() => {
    const bottom = pillTop - 4;
    // ซ้อนมุมท้ายชื่อได้นิดหน่อย (แบบโปสเตอร์) แต่ห้ามลงไปชนกล่องนับถอยหลัง
    const h = Math.min((40 * H) / 170, bottom - (headBottom - 20));
    return { w: (trackW * h) / ((40 * H) / 170), h, top: bottom - h, right: 12, sw: 2.4 };
  })();
  const trackBox =
    size === "small"
      ? small
      : size === "medium"
        ? { w: trackW, h: H - 24, top: 12, right: 14, sw: 3 }
        : { w: trackW, h: (150 * H) / 382, top: (168 * H) / 382, right: 10, sw: 3.4 };
  const checker = size === "small" ? 120 : size === "medium" ? 170 : 200;
  const timelineW = Math.min(168, W - pad.l - trackBox.w - trackBox.right - 8);
  // ชั้น text สูงเท่าเนื้อหาพอดี (เผื่อเล็กน้อย) — ยิ่งไม่มีที่ว่างเกิน ยิ่งไม่ต้องย่อเมื่อ widget จริงเตี้ยกว่าที่คาด
  const textH = Math.ceil(
    headBottom +
      (size === "large" ? 7 + 13 : 0) +
      (size !== "small" && chipsFit ? 7 + 17 : 0) +
      (size === "large" ? 12 + sessions.length * 15 + Math.max(0, sessions.length - 1) * 6 : 0) +
      8,
  );
  const sideW = Math.max(checker, trackBox.w + trackBox.right, size === "large" ? 150 : 0);
  const [outW, outH] = layer === "text" ? [W, Math.min(H, textH)] : layer === "side" ? [sideW, H] : [W, H];
  const streak = streakSvg(u(size === "large" ? 5 : 4), size === "large" ? [u(90), u(34), u(14)] : [u(46), u(18), u(8)]);

  const meta = (
    <div style={{ display: "flex", alignItems: "center", gap: u(6) }}>
      <div
        style={{
          display: "flex", background: RED, color: "#fff", borderRadius: u(4), padding: `${u(1)}px ${u(6)}px`,
          fontFamily: "Archivo", fontStyle: "italic", fontWeight: 900, fontSize: u(9.5),
        }}
      >
        {`R${race.round}`}
      </div>
      <div style={{ display: "flex", fontFamily: "Chakra", fontWeight: 600, fontSize: u(9.5), color: T.dim }}>
        {size === "small"
          ? raceCountry(race)
          : `${race.season} · ${raceCountry(race)}${!chipsFit && laps ? ` · ${laps} รอบ` : ""}`}
      </div>
    </div>
  );

  const chipRow = (
    <div style={{ display: "flex", gap: u(5), marginTop: u(7) }}>
      {chips.map((c) => (
        <div
          key={c}
          style={{
            display: "flex", fontFamily: "Chakra", fontWeight: 600, fontSize: u(9), color: T.ink,
            border: `${u(1)}px solid ${T.line}`, borderRadius: u(99), padding: `${u(1)}px ${u(7)}px`,
          }}
        >
          {c}
        </div>
      ))}
    </div>
  );

  const timeline = (
    <div style={{ display: "flex", flexDirection: "column", gap: u(6), marginTop: u(12), width: u(timelineW) }}>
      {sessions.map((x) => {
        const hot = x.state === "next" || x.state === "live";
        const done = x.state === "done";
        return (
          <div key={x.code} style={{ display: "flex", alignItems: "center", gap: u(8), opacity: done ? 0.45 : 1 }}>
            <div
              style={{
                display: "flex", width: u(10), height: u(10), borderRadius: u(5),
                background: hot ? RED : T.bg,
                border: `${u(2)}px solid ${hot ? RED : x.code === "RACE" ? T.ink : T.line}`,
              }}
            />
            <div style={{ display: "flex", width: u(40), fontFamily: "Archivo", fontStyle: "italic", fontWeight: 900, fontSize: u(11), color: hot ? RED : T.ink }}>
              {x.code}
            </div>
            <div style={{ display: "flex", flex: 1, fontFamily: "Chakra", fontWeight: 600, fontSize: u(10), color: T.dim }}>
              {x.state === "live" ? "กำลังแข่ง" : x.day}
            </div>
            <div style={{ display: "flex", fontFamily: "Chakra", fontWeight: 600, fontSize: u(10), color: hot ? RED : T.ink }}>{x.time}</div>
          </div>
        );
      })}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: layer === "full" ? T.bg : "transparent" }}>
        {layer === "full" && T.tex && (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse วาดด้วย satori ไม่ใช่หน้าเว็บ
          <img alt="" src={carbonSvg(u(W), u(H), T.tex)} width={u(W)} height={u(H)} style={{ position: "absolute", left: 0, top: 0 }} />
        )}
        {layer !== "text" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={checkerSvg(u(checker), T.ink, theme === "dark" ? 0.22 : 0.13)} width={u(checker)} height={u(checker)} style={{ position: "absolute", right: 0, top: 0 }} />
        )}
        {layer !== "text" && path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={trackSvg(path.d, path.w, path.h, u(trackBox.w), u(trackBox.h), u(trackBox.sw), T.ink, T.bg)}
            width={u(trackBox.w)}
            height={u(trackBox.h)}
            style={{ position: "absolute", right: u(trackBox.right), top: u(trackBox.top) }}
          />
        )}
        {layer !== "side" && (
          <div style={{ display: "flex", flexDirection: "column", padding: `${u(pad.t)}px ${u(pad.r)}px 0 ${u(pad.l)}px`, width: "100%" }}>
            {meta}
            <div
              style={{
                display: "flex", marginTop: u(size === "large" ? 6 : 5), fontFamily: "Archivo", fontStyle: "italic", fontWeight: 900,
                fontSize: u(nameSize), lineHeight: 0.9, color: T.ink, letterSpacing: -u(nameSize) * 0.01, whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={streak.uri} width={streak.w} height={u(size === "large" ? 5 : 4)} style={{ marginTop: u(5) }} />
            {size === "large" && (
              <div style={{ display: "flex", marginTop: u(7), fontFamily: "Chakra", fontWeight: 600, fontSize: u(10), color: T.dim }}>
                {`${race.raceName} · ${race.Circuit.Location.locality}`}
              </div>
            )}
            {size !== "small" && chipsFit && chipRow}
            {size === "large" && timeline}
          </div>
        )}
        {layer !== "text" && size === "large" && winner && (
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-end", position: "absolute",
              right: u(pad.r), bottom: u(14),
            }}
          >
            <div style={{ display: "flex", fontFamily: "Chakra", fontWeight: 600, fontSize: u(9.5), color: T.dim }}>ผู้ชนะครั้งล่าสุด</div>
            <div style={{ display: "flex", fontFamily: "Archivo", fontStyle: "italic", fontWeight: 900, fontSize: u(14), color: T.ink }}>
              {winner.name}
              <span style={{ color: RED, marginLeft: u(4) }}>{`’${String(winner.year).slice(2)}`}</span>
            </div>
          </div>
        )}
      </div>
    ),
    {
      width: Math.round(u(outW)),
      height: Math.round(u(outH)),
      fonts: [
        { name: "Archivo", data: archivo, weight: 900, style: "italic" },
        { name: "Chakra", data: chakra6, weight: 600, style: "normal" },
        { name: "Chakra", data: chakra7, weight: 700, style: "normal" },
      ],
      headers: {
        // รูปเปลี่ยนตาม URL เท่านั้น (สนาม/ขนาด/ธีม/session ถัดไป) → แคชยาวได้
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
