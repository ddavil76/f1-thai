import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "F1 Week Race",
    short_name: "F1 Week Race",
    description: "ตารางแข่ง F1 นับถอยหลัง และตารางคะแนน เวลาไทย (GMT+7)",
    start_url: "/",
    display: "standalone",
    background_color: "#08080a",
    theme_color: "#08080a",
    lang: "th",
    orientation: "portrait",
    categories: ["sports"],
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
