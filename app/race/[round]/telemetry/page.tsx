import { redirect } from "next/navigation";

/** เทียบเทเลเมทรีย้ายไปเป็นแท็บ "เทียบรอบ" ในหน้ารีเพลย์ — ลิงก์เก่า (รวม ?s=&a=&b=) ยังใช้ได้ */
export default async function TelemetryPage({
  params,
  searchParams,
}: {
  params: Promise<{ round: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { round } = await params;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") q.set(k, v);
  }
  q.set("v", "lap");
  redirect(`/race/${encodeURIComponent(round)}/replay?${q}`);
}
