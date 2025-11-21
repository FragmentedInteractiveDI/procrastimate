import React from "react";

export default function AvatarDisplay({ equipped }) {
  const { hat, skin } = equipped || {};

  const skinDisplay = skin === "skin_classic" ? "🙂" : "🧑";
  const hatDisplay = hat === "hat_cap" ? "🧢" : "";

  return (
    <div
      style={{
        fontSize: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 100,
        width: 100,
        border: "2px solid #888",
        borderRadius: 12,
        background: "#222",
        color: "#fff",
        margin: "0 auto",
      }}
    >
      <span>{hatDisplay}{skinDisplay}</span>
    </div>
  );
}
