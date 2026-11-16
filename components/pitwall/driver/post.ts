/** โหลดขั้นแต่งภาพของ three (ลบขอบหยัก · ปรับโทนสี) — โหลดเมื่อเลือกกราฟิกสูง */
import type { PostAddons } from "./scene";

export async function loadPost(): Promise<PostAddons | undefined> {
  try {
    const [{ EffectComposer }, { RenderPass }, { SMAAPass }, { OutputPass }] = await Promise.all([
      import("three/addons/postprocessing/EffectComposer.js"),
      import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/SMAAPass.js"),
      import("three/addons/postprocessing/OutputPass.js"),
    ]);
    return { EffectComposer, RenderPass, SMAAPass, OutputPass } as unknown as PostAddons;
  } catch {
    return undefined;
  }
}
