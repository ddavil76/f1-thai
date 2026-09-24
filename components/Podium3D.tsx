"use client";

import { useEffect, useRef, useState } from "react";
import { whenVisible } from "@/lib/visible";

type Slot = { pos: number; color: string };

/**
 * แท่นโพเดียมแบบ 3 มิติ + กระดาษโปรย — วาดทับเฉพาะ "แท่น" ของโพเดียม 2D
 * รูป ชื่อ และลิงก์นักขับยังเป็น DOM ปกติ (แตะได้ อ่านออก) ตัว canvas ไม่รับการแตะ
 *
 * · กล้องตั้งให้ 1 หน่วย = 1 px ที่ระนาบ z=0 → หน้าแท่น 3D ทับตำแหน่งแท่น 2D (.podium-block) พอดี
 *   กล้องอยู่สูงกว่าแท่นจึงเห็นด้านบนและด้านข้างแบบมีมิติ
 * · แท่นดันขึ้นจากพื้นตอนโหลด แล้วกระดาษโปรยร่วง · แตะการ์ดเพื่อโปรยอีกรอบ
 * · หยุดวาดเมื่อกระดาษร่วงหมด (ไม่วนเปลืองแบต) · ลดการเคลื่อนไหว/ไม่มี WebGL → คงแบบ 2D
 */
export default function Podium3D({ slots, children }: { slots: Slot[]; children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const key = slots.map((s) => `${s.pos}:${s.color}`).join("|");

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2") && !probe.getContext("webgl")) return;
    const colors = new Map(key.split("|").map((p) => [Number(p.split(":")[0]), p.split(":")[1]]));

    let disposed = false;
    let cleanup = () => {};

    // สร้างฉากเมื่อมองเห็นจริงเท่านั้น (แท็บที่ยังไม่เปิด / ยังเลื่อนไม่ถึง → ยังไม่โหลดอะไร)
    const visible = whenVisible(el);

    (async () => {
      await visible.ready;
      if (disposed) return;
      const THREE = await import("three");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      const cv = renderer.domElement;
      Object.assign(cv.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
      el.appendChild(cv);

      const scene = new THREE.Scene();
      const FOV = 30;
      const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 5000);
      const blocks = new THREE.Group();
      scene.add(blocks);
      let blockStuff: { dispose(): void }[] = [];
      let W = 1;
      let H = 1;

      /* ---- แท่น: วัดตำแหน่งจากแท่น 2D แล้วสร้างกล่องให้หน้าตรงกัน ---- */
      const shade = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);
      const faceTexture = (pos: number, color: string, w: number, h: number) => {
        const c = document.createElement("canvas");
        const s = 2;
        c.width = Math.max(8, Math.round(w * s));
        c.height = Math.max(8, Math.round(h * s));
        const g = c.getContext("2d")!;
        g.fillStyle = "#101014";
        g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = color;
        g.globalAlpha = 0.28;
        g.fillRect(0, 0, c.width, c.height);
        g.globalAlpha = 1;
        g.fillRect(0, 0, c.width, 3 * s); // ขอบบนสีทีมแบบแท่น 2D
        g.font = `bold ${Math.round(26 * s)}px "Chakra Petch", system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "top";
        g.fillText(String(pos), c.width / 2, 6 * s);
        return new THREE.CanvasTexture(c);
      };

      // วัดด้วย offset* (ค่าจาก layout) ไม่ใช่ getBoundingClientRect — แท่น 2D มีแอนิเมชันดันขึ้น
      // และการ์ดเอียงได้ (transform) ค่าจากจอจะเพี้ยนตามจังหวะนั้น
      const layout = () => {
        W = el.clientWidth;
        H = el.clientHeight;
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        // ระยะที่ทำให้ 1 หน่วย = 1 px ที่ z=0 · กล้องอยู่กึ่งกลางกรอบ มองตรง
        const dist = H / 2 / Math.tan((FOV * Math.PI) / 360);
        camera.position.set(W / 2, -H / 2 + H * 0.12, dist);
        camera.lookAt(W / 2, -H / 2 + H * 0.12, 0);
        camera.updateProjectionMatrix();

        blocks.clear();
        blockStuff.forEach((d) => d.dispose());
        blockStuff = [];
        el.querySelectorAll<HTMLElement>(".podium-block").forEach((b) => {
          const pos = Number(b.dataset.pos);
          const color = colors.get(pos) ?? "#888888";
          let x = 0;
          let y = 0;
          for (let n: HTMLElement | null = b; n && n !== el; n = n.offsetParent as HTMLElement | null) {
            x += n.offsetLeft;
            y += n.offsetTop;
          }
          const r = { width: b.offsetWidth, height: b.offsetHeight };
          const depth = r.width * 0.5;
          const geo = new THREE.BoxGeometry(r.width, r.height, depth);
          geo.translate(0, r.height / 2, -depth / 2); // จุดหมุนที่ฐาน-หน้า → ดันขึ้นจากพื้นได้
          const tex = faceTexture(pos, color, r.width, r.height);
          const mats = [
            new THREE.MeshBasicMaterial({ color: shade(color, 0.32) }), // ขวา
            new THREE.MeshBasicMaterial({ color: shade(color, 0.26) }), // ซ้าย
            new THREE.MeshBasicMaterial({ color: shade(color, 0.75) }), // บน
            new THREE.MeshBasicMaterial({ color: 0x050506 }), // ล่าง
            new THREE.MeshBasicMaterial({ map: tex }), // หน้า
            new THREE.MeshBasicMaterial({ color: 0x050506 }), // หลัง
          ];
          const m = new THREE.Mesh(geo, mats);
          m.position.set(x + r.width / 2, -(y + r.height), 0);
          m.userData.delay = pos === 1 ? 0.09 : pos === 2 ? 0 : 0.18;
          blocks.add(m);
          blockStuff.push(geo, tex, ...mats);
        });
      };

      /* ---- กระดาษโปรย ---- */
      const N = 160;
      const PALETTE = ["#e10600", "#ffffff", "#ffd230", ...colors.values()];
      const confGeo = new THREE.PlaneGeometry(5, 9);
      const confMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const confetti = new THREE.InstancedMesh(confGeo, confMat, N);
      confetti.frustumCulled = false;
      scene.add(confetti);
      const P = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, rx: 0, ry: 0, spin: 0, alive: false }));
      const col = new THREE.Color();
      P.forEach((_, i) => confetti.setColorAt(i, col.set(PALETTE[i % PALETTE.length])));
      const dummy = new THREE.Object3D();
      const burst = () => {
        for (const p of P) {
          p.x = Math.random() * W;
          p.y = 20 + Math.random() * H * 0.6; // เริ่มเหนือกรอบ (y บวก = สูงกว่าขอบบน)
          p.z = 20 + Math.random() * 60;
          p.vx = (Math.random() - 0.5) * 60;
          p.vy = -(60 + Math.random() * 90);
          p.rx = Math.random() * Math.PI;
          p.ry = Math.random() * Math.PI;
          p.spin = (Math.random() - 0.5) * 10;
          p.alive = true;
        }
        start();
      };

      let rise = 0; // วินาทีตั้งแต่เริ่ม (ใช้ทำแท่นดันขึ้น)
      let last: number | null = null;
      const tick = (time: number) => {
        const dt = last === null ? 0 : Math.min((time - last) / 1000, 0.05);
        last = time;
        rise += dt;
        for (const m of blocks.children) {
          const k = Math.min(1, Math.max(0, (rise - m.userData.delay) / 0.6));
          m.scale.y = Math.max(0.001, 1 - (1 - k) ** 3); // ease-out
        }
        let alive = 0;
        P.forEach((p, i) => {
          if (p.alive) {
            p.vy -= 30 * dt; // แรงโน้มถ่วงเบา ๆ + ลมส่าย
            p.vx += Math.sin(time / 400 + i) * 12 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rx += p.spin * dt;
            p.ry += p.spin * 0.7 * dt;
            if (p.y < -H - 20) p.alive = false;
            else alive++;
          }
          dummy.position.set(p.x, p.alive ? p.y : 1e5, p.z);
          dummy.rotation.set(p.rx, p.ry, 0);
          dummy.updateMatrix();
          confetti.setMatrixAt(i, dummy.matrix);
        });
        confetti.instanceMatrix.needsUpdate = true;
        renderer.render(scene, camera);
        // แท่นขึ้นครบและกระดาษร่วงหมด → หยุดวาด
        if (alive === 0 && rise > 1) renderer.setAnimationLoop(null);
      };
      const start = () => {
        last = null;
        renderer.setAnimationLoop(tick);
      };

      layout();
      const ro = new ResizeObserver(() => {
        layout();
        renderer.render(scene, camera);
      });
      ro.observe(el);
      const onTap = () => burst();
      el.addEventListener("pointerdown", onTap);
      setReady(true);
      burst();

      cleanup = () => {
        renderer.setAnimationLoop(null);
        ro.disconnect();
        el.removeEventListener("pointerdown", onTap);
        blockStuff.forEach((d) => d.dispose());
        [confGeo, confMat].forEach((d) => d.dispose());
        confetti.dispose();
        renderer.dispose();
        // คืน WebGL context ทันที ไม่รอ GC — Safari บน iPhone จำกัดจำนวน context ที่เปิดค้างได้เข้มกว่า
        renderer.forceContextLoss();
        cv.remove();
      };
      if (disposed) cleanup();
    })().catch(() => {
      // three โหลดไม่ได้ → โพเดียม 2D ต่อไป
    });

    return () => {
      disposed = true;
      visible.cancel();
      cleanup();
    };
  }, [key]);

  return (
    <div ref={wrap} className="podium3d relative" data-ready={ready ? "" : undefined}>
      {children}
    </div>
  );
}
