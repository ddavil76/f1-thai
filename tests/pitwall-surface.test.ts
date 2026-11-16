import { beforeAll, describe, expect, it } from "vitest";
import { buildDriveTrack, DS, type DriveTrack } from "@/lib/pitwall/drive/line";
import { loadRawTrack } from "@/lib/pitwall/drive/tracks";
import { isCorner, kerbWidth, surfaceOf } from "@/lib/pitwall/drive/surface";
import { newCar, perfOf, stepFree } from "@/lib/pitwall/drive/car";

let t: DriveTrack;
beforeAll(async () => {
  t = buildDriveTrack("monza", await loadRawTrack("monza"))!;
});
/** จุดแรกที่เป็นโค้ง / ทางตรง */
const find = (corner: boolean) => {
  for (let i = 50; i < t.n; i++) if (isCorner(t, i) === corner && isCorner(t, i + 3) === corner && isCorner(t, i - 3) === corner) return i * DS;
  throw new Error("ไม่เจอ");
};

describe("พื้นผิวสนาม", () => {
  it("ในถนน = ถนน · ในโค้งเลยขอบ = ขอบทางแล้วกรวด · ทางตรงเลยขอบ = หญ้า", () => {
    const sc = find(true);
    const i = Math.floor(sc / DS);
    expect(surfaceOf(t, sc, 0)).toBe("road");
    expect(surfaceOf(t, sc, t.wr[i] + kerbWidth(t) / 2)).toBe("kerb");
    expect(surfaceOf(t, sc, -t.wl[i] - kerbWidth(t) - 1)).toBe("gravel");
    const ss = find(false);
    expect(surfaceOf(t, ss, t.wr[Math.floor(ss / DS)] + 1)).toBe("grass");
  });

  it("ล้อบนขอบทาง = รถรู้ (ไว้สั่น/เสียง) · กรวดหน่วงความเร็วมากกว่าหญ้า", () => {
    const sc = find(true);
    const i = Math.floor(sc / DS);
    const c = newCar(t, { s: sc, v: 40, lat: 0 });
    c.d = t.wr[i] + 0.3;
    stepFree(t, c, { throttle: false, brake: false, steer: 0 }, perfOf(0));
    expect(c.kerb).toBeGreaterThan(0);
    const roll = (s: number, d: number) => {
      const k = newCar(t, { s, v: 40, lat: 0 });
      k.d = d;
      for (let n = 0; n < 60; n++) {
        stepFree(t, k, { throttle: false, brake: false, steer: 0 }, perfOf(0));
        k.d = d;
        k.psi = 0;
      }
      return k.v;
    };
    const gravel = roll(sc, -t.wl[i] - kerbWidth(t) - 3);
    const ss = find(false);
    const grass = roll(ss, t.wr[Math.floor(ss / DS)] + 3);
    expect(gravel).toBeLessThan(grass);
  });
});
