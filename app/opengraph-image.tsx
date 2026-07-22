import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "3·2·1guess — Futbolcu tahmin oyunu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          background: "#f6f2ea",
          backgroundImage:
            "radial-gradient(1000px 700px at 50% -200px, rgba(63,107,86,0.10), transparent 60%), radial-gradient(700px 500px at 100% 100%, rgba(63,107,86,0.06), transparent 60%)",
          padding: "72px 88px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top rule + eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 60, height: 3, background: "#3f6b56" }} />
          <div
            style={{
              color: "#7a746a",
              fontSize: 22,
              letterSpacing: 6,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Futbolcu · Tahmin · Oyunu
          </div>
        </div>

        {/* Wordmark */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 220,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              color: "#1e1c19",
              lineHeight: 1,
              display: "flex",
              alignItems: "baseline",
            }}
          >
            <span style={{ color: "#3f6b56" }}>3·2·1</span>
            <span>guess</span>
          </div>
          <div
            style={{
              fontSize: 34,
              color: "#4a4640",
              fontWeight: 400,
              maxWidth: 900,
            }}
          >
            İki takım, bir cevap. Arkadaşınla ekran başında oynanan futbol tahmin oyunu.
          </div>
        </div>

        {/* Bottom row: stats + domain */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #d9d3c4",
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", gap: 56, color: "#4a4640" }}>
            <Stat label="lig" value="15" />
            <Stat label="kulüp" value="371" />
            <Stat label="futbolcu" value="75K+" />
          </div>
          <div
            style={{
              fontSize: 26,
              letterSpacing: 3,
              color: "#3f6b56",
              fontWeight: 700,
            }}
          >
            321guess.com
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 42, fontWeight: 800, color: "#1e1c19", lineHeight: 1 }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 18,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#7a746a",
        }}
      >
        {label}
      </div>
    </div>
  );
}
