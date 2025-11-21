import React from "react";

export default function BetaBadge({ show = false }) {
  if (!show) return null;
  return (
    <span
      style={{
        marginLeft: 8,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.5,
        background: "#1f2937",
        color: "#facc15",
        border: "1px solid #374151",
      }}
      title="Beta Mode: earnings & payouts are sandboxed for testers."
    >
      BETA
    </span>
  );
}
