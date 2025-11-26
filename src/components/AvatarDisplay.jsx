// FILE: src/components/AvatarDisplay.jsx
import React from "react";
import Avatar, { SKIN_STYLES, HAT_STYLES } from "./Avatar";
import { useAvatar } from "../context/AvatarContext";

/**
 * AvatarDisplay - Large preview card for Customize screen
 * Shows the equipped avatar with labels
 */
export default function AvatarDisplay({ className = "" }) {
  const { avatar } = useAvatar();
  
  // Get names from style maps
  const skinStyle = SKIN_STYLES[avatar.skinId] || SKIN_STYLES.skin_classic;
  const hatStyle = avatar.hatId ? HAT_STYLES[avatar.hatId] : null;
  
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* Large avatar with subtle border */}
      <div 
        className="p-8 rounded-2xl border-2 dark:border-neutral-700 border-neutral-300 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center"
        style={{
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        }}
      >
        <Avatar size="lg" />
      </div>
      
      {/* Equipment labels */}
      <div className="text-center space-y-1">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Equipped
        </div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5">
          <div>
            <span className="font-medium">Hat:</span>{" "}
            <span className={hatStyle ? "" : "italic opacity-75"}>
              {hatStyle ? hatStyle.name : "None"}
            </span>
          </div>
          <div>
            <span className="font-medium">Skin:</span>{" "}
            <span>{skinStyle.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}