export function RangeHUD() {
  return (
    <div
      id="range-hud"
      role="status"
      style={{
        display: "none",
        position: "absolute",
        left: "50%",
        bottom: 80,
        transform: "translateX(-50%)",
        width: "min(720px, 85vw)",
        padding: "12px 18px",
        background: "#102431ed",
        borderTop: "2px solid #6edce5",
        color: "#d1f4fa",
        fontFamily: "monospace",
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      <div
        id="range-hit"
        style={{ opacity: 0, color: "#ffdd81", height: 16 }}
      />
      <strong id="weapon-readout">FIRING RANGE</strong>
      <div id="range-status" style={{ marginTop: 8 }} />
      <div
        id="range-hints"
        style={{ marginTop: 8, fontSize: 11, color: "#9eafb9" }}
      />
    </div>
  );
}
