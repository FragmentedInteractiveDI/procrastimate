// FILE: src/components/Avatar.jsx
import React from "react";
import { useAvatar } from "../context/AvatarContext";

// Import body sprites
import bodyBlue from "../assets/avatar/bodies/avatar_body_blue.png";
import bodyPurple from "../assets/avatar/bodies/avatar_body_purple.png";
import bodyRed from "../assets/avatar/bodies/avatar_body_red.png";
import bodyYellow from "../assets/avatar/bodies/avatar_body_yellow.png";

// Import face/expression sprites
import faceAnxious from "../assets/avatar/faces/avatar_face_anxious.png";
import faceHappy from "../assets/avatar/faces/avatar_face_happy.png";
import faceLovely from "../assets/avatar/faces/avatar_face_lovely.png";
import faceSad from "../assets/avatar/faces/avatar_face_sad.png";
import faceTired from "../assets/avatar/faces/avatar_face_tired.png";

// Import hat sprites
import hatBowler from "../assets/avatar/hats/avatar_hat_bowler.png";
import hatCap from "../assets/avatar/hats/avatar_hat_cap.png";
import hatWizard from "../assets/avatar/hats/avatar_hat_wizard.png";

// Body definitions
export const BODY_STYLES = {
  mate_bibby: {
    name: "Bibby",
    image: bodyBlue,
    color: "#3b82f6",
  },
  mate_blossom: {
    name: "Blossom",
    image: bodyPurple,
    color: "#a855f7",
  },
  mate_scrab: {
    name: "Scrab",
    image: bodyRed,
    color: "#ef4444",
  },
  mate_rays: {
    name: "Rays",
    image: bodyYellow,
    color: "#eab308",
  },
};

// Expression definitions
export const EXPRESSION_STYLES = {
  expr_anxious: {
    name: "Anxious",
    image: faceAnxious,
  },
  expr_happy: {
    name: "Happy",
    image: faceHappy,
  },
  expr_lovely: {
    name: "Lovely",
    image: faceLovely,
  },
  expr_sad: {
    name: "Sad",
    image: faceSad,
  },
  expr_tired: {
    name: "Tired",
    image: faceTired,
  },
};

// Hat definitions
export const HAT_STYLES = {
  hat_bowler: {
    name: "Bowler Hat",
    image: hatBowler,
  },
  hat_cap: {
    name: "Cap",
    image: hatCap,
  },
  hat_wizard: {
    name: "Wizard Hat",
    image: hatWizard,
  },
};

/**
 * Avatar component
 * All PNGs are 64x64 and properly centered
 */
export default function Avatar({
  size = "md",
  bodyId: propBodyId,
  expressionId: propExpressionId,
  hatId: propHatId,
  className = "",
}) {
  const { avatar } = useAvatar();

  // Resolve IDs
  const bodyId = propBodyId || avatar?.bodyId || "mate_bibby";
  const expressionId = propExpressionId || avatar?.expressionId || "expr_happy";
  const hatId = propHatId !== undefined ? propHatId : (avatar?.hatId || null);

  // Get style objects
  const bodyStyle = BODY_STYLES[bodyId] || BODY_STYLES.mate_bibby;
  const expressionStyle = EXPRESSION_STYLES[expressionId] || EXPRESSION_STYLES.expr_happy;
  const hatStyle = hatId && HAT_STYLES[hatId] ? HAT_STYLES[hatId] : null;

  // Size mapping (in pixels)
  const sizeMap = {
    sm: 40,    // header
    md: 64,    // default/list items
    lg: 80,
    xl: 128,   // main preview
  };
  
  const containerSize = sizeMap[size] || sizeMap.md;
  const scale = containerSize / 64; // All PNGs are 64x64

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{
        width: containerSize,
        height: containerSize,
        overflow: 'hidden',
        position: 'relative', // CRITICAL: Explicitly set this
      }}
    >
      {/* Wrapper that scales all layers together */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '64px',
          height: '64px',
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Layer 1: Body */}
        {bodyStyle?.image && (
          <img
            src={bodyStyle.image}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '64px',
              height: '64px',
              imageRendering: 'pixelated',
              userSelect: 'none',
            }}
          />
        )}

        {/* Layer 2: Expression */}
        {expressionStyle?.image && (
          <img
            src={expressionStyle.image}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '64px',
              height: '64px',
              imageRendering: 'pixelated',
              userSelect: 'none',
            }}
          />
        )}

        {/* Layer 3: Hat */}
        {hatStyle?.image && (
          <img
            src={hatStyle.image}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '64px',
              height: '64px',
              imageRendering: 'pixelated',
              userSelect: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}