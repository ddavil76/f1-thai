/* ---------- ชิ้นส่วนเครื่องยนต์ (PU elements) จากเอกสาร FIA ---------- */
// ไม่มี API ให้ดึง — FIA ออกเป็น PDF ทุกสนาม:
//  · "PU Elements used per Driver up to now" = ยอดสะสมทั้งฤดูกาล (ออกก่อน FP1)
//  · "New PU Elements for this Competition"  = ใครเปลี่ยนชิ้นไหนระหว่างสุดสัปดาห์
//  · "Infringement … PU elements …"          = คำตัดสินโทษกริด
// ไฟล์นี้ห้าม import อะไรของ Next — สคริปต์สร้างสแนปช็อตรันด้วย node ตรง ๆ

import { getDocumentProxy } from "unpdf";

export const PU_KEYS = ["ICE", "TC", "EXH", "MGU-K", "ES", "PU-CE", "PU-ANC"] as const;
export type PuKey = (typeof PU_KEYS)[number];
export type PuUsed = Record<PuKey, number>;

export type PuDriver = { number: string; driver: string; team: string; used: PuUsed };
export type PuPenalty = {
  number: string;
  driver: string;
  event: string;
  session: string;
  decision: string;
  elements: string[];
  url: string;
};
export type PuDoc = { title: string; url: string; published: string };
export type PuData = {
  season: number;
  /** สนามล่าสุดที่มีเอกสารชิ้นส่วน */
  event: string;
  /** วันที่ของเอกสารล่าสุดที่ใช้ (YYYY-MM-DD) */
  updated: string;
  drivers: PuDriver[];
  penalties: PuPenalty[];
  sources: PuDoc[];
};

const FIA = "https://www.fia.com";
const LISTING = `${FIA}/documents/championships/fia-formula-one-world-championship-14`;
const HOUR = 60 * 60;
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; f1-week-race)" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// CloudFront ของ FIA ตอบ 502/504 เป็นพัก ๆ (บางไฟล์ค้างนาน) → จำกัดทีละ 3 + timeout + retry
let active = 0;
const queue: (() => void)[] = [];

type GetOpts = { attempts?: number; deadline?: number };

async function get(
  url: string,
  revalidate: number,
  { attempts = 3, deadline }: GetOpts = {},
): Promise<Response> {
  if (active >= 3) await new Promise<void>((resolve) => queue.push(resolve));
  active++;
  try {
    let status = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (deadline && Date.now() > deadline) throw new Error(`FIA time budget spent before ${url}`);
      if (attempt > 0) await sleep(800 * attempt);
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15_000),
        next: { revalidate },
      }).catch(() => null);
      if (res?.ok) return res;
      status = res?.status ?? 0;
      if (status >= 400 && status < 500 && status !== 429) break;
    }
    throw new Error(`FIA ${status || "network error"} on ${url}`);
  } finally {
    active--;
    queue.shift()?.();
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

export const zeroUsed = () =>
  Object.fromEntries(PU_KEYS.map((k) => [k, 0])) as PuUsed;

/* ---------- หน้ารายการเอกสาร ---------- */

type FiaEvent = { name: string; docs: PuDoc[] };

function parseDocs(html: string): PuDoc[] {
  return html
    .split('class="document-row')
    .slice(1)
    .flatMap((row) => {
      const href = row.match(/href="([^"]+\.pdf)"/)?.[1];
      const title = row.match(/class="title">([\s\S]*?)<\/div>/)?.[1];
      if (!href || !title) return [];
      return [
        {
          url: href.startsWith("http") ? href : FIA + href,
          title: decode(title),
          published: row.match(/date-display-single">([^<]+)</)?.[1]?.trim() ?? "",
        },
      ];
    });
}

/** สนามล่าสุด (มีเอกสารในหน้าเลย) + รายชื่อสนามก่อนหน้าเรียงใหม่ → เก่า */
async function seasonIndex(season: number) {
  const base = await (await get(LISTING, 3 * HOUR)).text();
  const href = [...base.matchAll(/<option value="([^"]+)">SEASON (\d{4})<\/option>/g)].find(
    (m) => Number(m[2]) === season,
  )?.[1];
  if (!href) return null;

  const html = await (await get(FIA + href, 3 * HOUR)).text();
  const active = html.match(/class="event-title active">\s*([^<]*?)\s*</)?.[1];
  if (!active) return null;
  return {
    latest: { name: decode(active), docs: parseDocs(html) } as FiaEvent,
    older: [...html.matchAll(/class="event-title data-id-(\d+)\s+use-ajax">\s*([^<]*?)\s*<\/a>/g)].map(
      (m) => ({ id: m[1], name: decode(m[2]) }),
    ),
  };
}

/** สนามเก่าโหลดผ่าน endpoint ajax ของเว็บ FIA (ตอบเป็น JSON ที่มี HTML ข้างใน) */
async function loadEvent(ref: { id: string; name: string }): Promise<FiaEvent> {
  const cmds = (await (
    await get(`${FIA}/decision-document-list/ajax/${ref.id}`, 6 * HOUR)
  ).json()) as { data?: unknown }[];
  const html = cmds.map((c) => (typeof c.data === "string" ? c.data : "")).join("\n");
  return { name: ref.name, docs: parseDocs(html) };
}

const isUsage = (d: PuDoc) => /PU Elements used per Driver/i.test(d.title);
const isNew = (d: PuDoc) => /New PU Elements/i.test(d.title);
const isPenalty = (d: PuDoc) =>
  /Infringement/i.test(d.title) && /PU elements|Power Unit/i.test(d.title);

/* ---------- อ่าน PDF เป็นข้อความพร้อมพิกัด ---------- */

type Item = { s: string; x: number; y: number };
type Line = { y: number; items: Item[]; text: string };

async function pdfPages(url: string, opts?: GetOpts): Promise<Item[][]> {
  const buf = new Uint8Array(await (await get(url, 24 * HOUR, opts)).arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const pages: Item[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const { items } = await (await pdf.getPage(p)).getTextContent();
    pages.push(
      items.flatMap((i) =>
        "str" in i && i.str.trim()
          ? [{ s: i.str.trim(), x: i.transform[4] as number, y: i.transform[5] as number }]
          : [],
      ),
    );
  }
  return pages;
}

/** รวมคำที่อยู่บรรทัดเดียวกัน (y ห่างไม่เกิน 2pt) เรียงบน → ล่าง ซ้าย → ขวา */
function toLines(items: Item[]): Line[] {
  const lines: Line[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const last = lines.at(-1);
    if (last && Math.abs(last.y - it.y) <= 2) last.items.push(it);
    else lines.push({ y: it.y, items: [it], text: "" });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.s).join(" ");
  }
  return lines;
}

const INT = /^\d{1,2}$/;
const near = (a: number, b: number, tol = 8) => Math.abs(a - b) <= tol;

/**
 * ตารางยอดสะสม — แยกคอลัมน์ด้วยพิกัด x และจับแถวด้วยเลขรถที่ใกล้ที่สุดตามแกน y
 * (ถ้าจับแค่บรรทัดเดียวกันตรง ๆ บางไฟล์ตัวเลขคอลัมน์ท้ายจะเยื้องไปแถวถัดไป)
 */
export function parseUsageTable(pages: Item[][]): PuDriver[] {
  for (const items of pages) {
    const head = toLines(items).find(
      (l) => l.items.some((i) => i.s === "Driver") && l.items.some((i) => i.s === "ICE"),
    );
    if (!head) continue;
    const driverX = head.items.find((i) => i.s === "Driver")!.x;
    const carX = head.items.find((i) => i.s === "Car")?.x ?? -99;
    const numX = head.items[0].x;

    const body = items.filter((i) => i.y < head.y - 4);
    const anchors = body.filter((i) => INT.test(i.s) && near(i.x, numX));
    const rowOf = (it: Item) => {
      let best: Item | undefined;
      let bestD = 6;
      for (const a of anchors) {
        const d = Math.abs(a.y - it.y);
        if (d <= bestD) [best, bestD] = [a, d];
      }
      return best;
    };

    const out: PuDriver[] = [];
    for (const a of anchors) {
      const cells = body.filter((i) => i !== a && rowOf(i) === a);
      const driver = cells.filter((i) => near(i.x, driverX)).map((i) => i.s).join(" ");
      const team = cells.filter((i) => near(i.x, carX)).map((i) => i.s).join(" ");
      const nums = cells
        .filter((i) => INT.test(i.s) && i.x > driverX + 40)
        .sort((p, q) => p.x - q.x);
      if (!driver || nums.length !== PU_KEYS.length) continue;
      const used = zeroUsed();
      PU_KEYS.forEach((k, j) => (used[k] = Number(nums[j].s)));
      out.push({ number: a.s, driver, team, used });
    }
    if (out.length) return out;
  }
  return [];
}

type Change = { number: string; driver: string; team: string; key: PuKey; count: number };

const NEW_HEAD = /Previously used\s+(ICE|TC|EXH|MGU-K|ES|PU-CE|PU-ANC)\b/;

/** รายงานชิ้นส่วนใหม่ — "Previously used X" = ใช้ไปแล้วกี่ชิ้น → ชิ้นนี้คือชิ้นที่ +1 */
export function parseNewElements(pages: Item[][]): Change[] {
  const out: Change[] = [];
  let key: PuKey | null = null;
  let cols = { num: 0, car: -99, driver: -99 };

  for (const items of pages) {
    for (const line of toLines(items)) {
      const h = line.text.match(NEW_HEAD);
      if (h) {
        const x = (label: string) => line.items.find((i) => i.s === label)?.x ?? -99;
        key = h[1] as PuKey;
        cols = { num: line.items[0].x, car: x("Car"), driver: x("Driver") };
        continue;
      }
      if (!key) continue;
      if (/^The\b/.test(line.text)) {
        key = null; // จบตาราง → ย่อหน้าคำอธิบาย
        continue;
      }
      const num = line.items.find((i) => INT.test(i.s) && near(i.x, cols.num));
      const driver = line.items
        .filter((i) => near(i.x, cols.driver) && !INT.test(i.s))
        .map((i) => i.s)
        .join(" ");
      const prev = line.items.findLast((i) => INT.test(i.s) && i.x > cols.driver + 40);
      if (!num || !driver || !prev) continue;
      const team = line.items.filter((i) => near(i.x, cols.car)).map((i) => i.s).join(" ");
      out.push({ number: num.s, driver, team, key, count: Number(prev.s) + 1 });
    }
  }
  return out;
}

const ORDINAL = /^(\d{1,2})(?:st|nd|rd|th)\s+(.+)$/;
const ELEMENT_IN = /\((ICE|TC|EXH|ES|PU-CE|PU-ANC|MGU-K)\)|\b(MGU-K)\b/;

/** คำตัดสินสจ๊วต — ใครโดน, โทษอะไร, และเป็นชิ้นที่เท่าไหร่ (ใช้เติมยอดกรณีเปลี่ยนใน parc fermé) */
export function parseInfringement(pages: Item[][]) {
  const lines = pages.flatMap((p) => toLines(p).map((l) => l.text));
  const who = lines
    .map((l) => l.match(/^No \/ Driver\s+(\d{1,2})\s*[-–]\s*(.+)$/))
    .find(Boolean);
  if (!who) return null;

  const field = (label: string) =>
    lines.find((l) => l.startsWith(`${label} `))?.slice(label.length).trim() ?? "";

  const decision: string[] = [];
  const di = lines.findIndex((l) => /^Decision\b/.test(l));
  for (let i = di; di >= 0 && i < lines.length && !/^Reason\b/.test(lines[i]); i++) {
    decision.push(i === di ? lines[i].replace(/^Decision\s*/, "") : lines[i]);
  }

  const elements: string[] = [];
  const counts: { key: PuKey; count: number }[] = [];
  for (const l of lines) {
    const m = l.match(ORDINAL);
    const k = m?.[2].match(ELEMENT_IN);
    if (!m || !k) continue;
    elements.push(l);
    counts.push({ key: (k[1] ?? k[2]) as PuKey, count: Number(m[1]) });
  }

  return {
    number: who[1],
    driver: who[2].trim(),
    session: field("Session"),
    decision: decision.join(" ").trim(),
    elements,
    counts,
  };
}

const isoDay = (published: string) => {
  const m = published.match(/^(\d{2})\.(\d{2})\.(\d{2})/);
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : "";
};

/* ---------- รวมทั้งหมด ---------- */

/**
 * ยอดใช้ชิ้นส่วนล่าสุดของฤดูกาล — throw ถ้าดึง/อ่านไม่ได้ (ให้ผู้เรียกใช้สแนปช็อตแทน)
 * คืน null ถ้าฤดูกาลนั้นยังไม่มีเอกสารเลย
 */
export async function fetchPuData(season: number): Promise<PuData | null> {
  const index = await seasonIndex(season);
  if (!index) return null;

  // ย้อนหาจนเจอตารางยอดสะสม (สนามล่าสุดอาจยังไม่ออก) และเอาอย่างน้อย 2 สนามให้มีรายการโทษ
  const events: FiaEvent[] = [index.latest];
  for (const ref of index.older) {
    const hasUsage = events.some((e) => e.docs.some(isUsage));
    if ((hasUsage && events.length >= 2) || events.length >= 4) break;
    events.push(await loadEvent(ref));
  }

  const usageAt = events.findIndex((e) => e.docs.some(isUsage));
  const usageDoc = usageAt >= 0 ? events[usageAt].docs.find(isUsage)! : null;
  // เอกสารชิ้นส่วนใหม่ของสนามที่เก่ากว่าตารางยอดสะสม ถูกนับรวมไปแล้ว
  const newDocs = (usageAt >= 0 ? events.slice(0, usageAt + 1) : events).flatMap((e) =>
    e.docs.filter(isNew),
  );
  const penaltyDocs = events.flatMap((e) =>
    e.docs.filter(isPenalty).map((doc) => ({ doc, event: e.name })),
  );

  // ตารางยอดสะสมพลาดไม่ได้ (throw) — เอกสารเสริมพลาดได้ ข้ามไป
  // และจำกัดเวลารวม เพราะบางไฟล์ FIA ตอบ 504 วนไปเรื่อย ๆ อย่าให้หน้าค้างรอ
  const deadline = Date.now() + 45_000;
  const parsedDocs: PuDoc[] = [];
  const optional = <T,>(doc: PuDoc, parse: (pages: Item[][]) => T) =>
    pdfPages(doc.url, { attempts: 2, deadline })
      .then((pages) => {
        parsedDocs.push(doc);
        return parse(pages);
      })
      .catch((err) => {
        console.warn("[pu] skipped doc:", err instanceof Error ? err.message : err);
        return null;
      });

  const [usage, changes, rulings] = await Promise.all([
    usageDoc ? pdfPages(usageDoc.url).then(parseUsageTable) : Promise.resolve([]),
    Promise.all(newDocs.map((d) => optional(d, parseNewElements))),
    Promise.all(
      penaltyDocs.map(({ doc, event }) =>
        optional(doc, (pages) => {
          const r = parseInfringement(pages);
          return r && { ...r, event, url: doc.url };
        }),
      ),
    ),
  ]);

  if (usageDoc && usage.length < 10) {
    throw new Error(`PU usage table parse failed (${usage.length} rows) — ${usageDoc.url}`);
  }

  // เลขรถเป็นของนักขับถาวร → ใช้เป็นกุญแจ (ย้ายทีมกลางฤดูกาลก็ยังตามคนเดิม)
  const rows = new Map<number, PuDriver>();
  for (const r of usage) rows.set(Number(r.number), r);
  const bump = (number: string, driver: string, team: string, key: PuKey, count: number) => {
    let row = rows.get(Number(number));
    if (!row) {
      row = { number, driver, team, used: zeroUsed() };
      rows.set(Number(number), row);
    }
    if (team) row.team = team;
    row.used[key] = Math.max(row.used[key], count);
  };
  // ใช้ค่ามากสุดเสมอ → ลำดับเอกสารไม่มีผล และอ่านซ้ำก็ไม่นับเบิ้ล
  for (const c of changes.flatMap((x) => x ?? [])) {
    bump(c.number, c.driver, c.team, c.key, c.count);
  }

  const penalties: PuPenalty[] = [];
  for (const r of rulings) {
    if (!r) continue;
    for (const c of r.counts) {
      const row = rows.get(Number(r.number));
      if (row) row.used[c.key] = Math.max(row.used[c.key], c.count);
    }
    penalties.push({
      number: r.number,
      driver: r.driver,
      event: r.event,
      session: r.session,
      decision: r.decision,
      elements: r.elements,
      url: r.url,
    });
  }

  if (rows.size === 0) return null;

  const sources = [
    ...(usageDoc ? [usageDoc] : []),
    ...[...newDocs, ...penaltyDocs.map((p) => p.doc)].filter((d) => parsedDocs.includes(d)),
  ];
  const withDocs = events.find((e) => e.docs.some((d) => isUsage(d) || isNew(d) || isPenalty(d)));

  return {
    season,
    event: withDocs?.name ?? index.latest.name,
    updated: sources.map((d) => isoDay(d.published)).filter(Boolean).sort().at(-1) ?? "",
    drivers: [...rows.values()],
    penalties,
    sources,
  };
}
