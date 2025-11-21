import React from "react";

const SKINS = {
  default: "🧍",
  light: "🧑🏻",
  medium: "🧑🏽",
  dark: "🧑🏿",
};

const HATS = {
  none: "",
  cap: "🧢",
  crown: "👑",
  cowboy: "🤠",
  helmet: "🪖",
};

export default function Avatar({ skin = "default", hat = "none", size = 48 }) {
  const skinEmoji = SKINS[skin] || SKINS.default;
  const hatEmoji = HATS[hat] || "";

  return (
    <div
      style={{
        fontSize: size,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        lineHeight: 1,
      }}
    >
      {hatEmoji && <div>{hatEmoji}</div>}
      <div>{skinEmoji}</div>
    </div>
  );
}
