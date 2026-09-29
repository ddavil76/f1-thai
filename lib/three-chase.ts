/* ---------- กล้องไล่หลังรถ (แบบกล้องถ่ายทอดสด) — ใช้ร่วม: รีเพลย์ 3D + เทเลเมทรี 3D ---------- */
// กล้องยึดกับรถตรง ๆ (ไม่หลุดเฟรมแม้รีเพลย์เร่ง 40×) แต่ "ทิศ" ที่กล้องหันค่อย ๆ หมุนตาม
// ทำให้ผ่านโค้งแล้วไม่สะบัด · เริ่มตาม/เปลี่ยนคัน → เลื่อนจากมุมเดิมเข้าหานุ่ม ๆ

import type * as THREE_NS from "three";

type V3 = THREE_NS.Vector3;

export type ChaseRig = {
  heading: V3;
  from: V3;
  fromLook: V3;
  want: V3;
  look: V3;
  blend: number;
  target: unknown;
};

export function chaseRig(THREE: typeof THREE_NS): ChaseRig {
  return {
    heading: new THREE.Vector3(),
    from: new THREE.Vector3(),
    fromLook: new THREE.Vector3(),
    want: new THREE.Vector3(),
    look: new THREE.Vector3(),
    blend: 1,
    target: null,
  };
}

/**
 * วางกล้องหลังรถที่ p วิ่งไปทาง t · who = ตัวระบุคันที่ตาม (เปลี่ยนคัน → เลื่อนเข้าหาใหม่)
 * lookNow = จุดที่กล้องมองอยู่ (ผู้เรียกเก็บไว้ ใช้ต่อตอนถอยกลับภาพรวม)
 */
export function chase(
  rig: ChaseRig,
  camera: THREE_NS.PerspectiveCamera,
  lookNow: V3,
  p: V3,
  t: V3,
  dt: number,
  who: unknown,
  { back, up, ahead }: { back: number; up: number; ahead: number },
) {
  const l = Math.hypot(t.x, t.z) || 1;
  if (rig.target !== who) {
    rig.target = who;
    rig.heading.set(t.x / l, 0, t.z / l);
    rig.from.copy(camera.position);
    rig.fromLook.copy(lookNow);
    rig.blend = 0;
  }
  const k = 1 - Math.pow(1 - 0.1, dt * 60);
  rig.heading.x += (t.x / l - rig.heading.x) * k;
  rig.heading.z += (t.z / l - rig.heading.z) * k;
  rig.heading.normalize();
  rig.want.set(p.x - rig.heading.x * back, p.y + up, p.z - rig.heading.z * back);
  rig.look.set(p.x + rig.heading.x * ahead, p.y + 0.04, p.z + rig.heading.z * ahead);
  rig.blend = Math.min(1, rig.blend + dt / 0.9);
  const e = rig.blend * rig.blend * (3 - 2 * rig.blend);
  camera.position.lerpVectors(rig.from, rig.want, e);
  lookNow.lerpVectors(rig.fromLook, rig.look, e);
  camera.lookAt(lookNow);
}

/** เลิกตาม — ครั้งหน้าที่ตามจะเลื่อนเข้าหาใหม่ */
export function release(rig: ChaseRig) {
  rig.target = null;
}
