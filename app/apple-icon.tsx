import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #e10600 0%, #7a0300 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 92, fontWeight: 900, letterSpacing: -4 }}>F1</div>
        <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.85, letterSpacing: 2 }}>
          WEEK RACE
        </div>
      </div>
    ),
    size,
  );
}
