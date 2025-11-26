// FILE: src/context/AvatarContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LS_KEY = "pm_avatar_v2"; // v2 for new body system
const LS_RENAME_KEY = "pm_avatar_rename_count_v1";

const DEFAULT_AVATAR = {
  bodyId: "mate_bibby",        // Default ProcrastiMate
  expressionId: "expr_happy",   // Default expression
  hatId: null,                  // No hat by default
  customName: null,             // Player's custom name (null = use default body name)
};

function readLS() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_AVATAR };
    
    return {
      bodyId: typeof raw.bodyId === "string" ? raw.bodyId : DEFAULT_AVATAR.bodyId,
      expressionId: typeof raw.expressionId === "string" ? raw.expressionId : DEFAULT_AVATAR.expressionId,
      hatId: typeof raw.hatId === "string" ? raw.hatId : DEFAULT_AVATAR.hatId,
      customName: typeof raw.customName === "string" ? raw.customName : null,
    };
  } catch {
    return { ...DEFAULT_AVATAR };
  }
}

function writeLS(avatar) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(avatar));
  } catch (e) {
    console.warn("Failed to persist avatar:", e);
  }
}

// Rename count tracking
function getRenameCount() {
  try {
    const count = parseInt(localStorage.getItem(LS_RENAME_KEY) || "0", 10);
    return isNaN(count) ? 0 : count;
  } catch {
    return 0;
  }
}

function setRenameCount(count) {
  try {
    localStorage.setItem(LS_RENAME_KEY, String(count));
  } catch {}
}

const AvatarContext = createContext({
  avatar: DEFAULT_AVATAR,
  setBody: () => {},
  setExpression: () => {},
  setHat: () => {},
  setCustomName: () => {},
  resetAvatar: () => {},
  getRenameCount: () => 0,
  getRenameCost: () => 0,
});

AvatarContext.displayName = "AvatarContext";

export function AvatarProvider({ children }) {
  const [avatar, setAvatarState] = useState(() => readLS());
  const [renameCount, setRenameCountState] = useState(() => getRenameCount());

  useEffect(() => {
    writeLS(avatar);
  }, [avatar]);

  useEffect(() => {
    setRenameCount(renameCount);
  }, [renameCount]);

  useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent("pm:avatar:change", { detail: avatar })
      );
    } catch {}
  }, [avatar]);

  const setBody = (id) => {
    setAvatarState((prev) => ({
      ...prev,
      bodyId: typeof id === "string" ? id : DEFAULT_AVATAR.bodyId,
    }));
  };

  const setExpression = (id) => {
    setAvatarState((prev) => ({
      ...prev,
      expressionId: typeof id === "string" ? id : DEFAULT_AVATAR.expressionId,
    }));
  };

  const setHat = (id) => {
    setAvatarState((prev) => ({
      ...prev,
      hatId: typeof id === "string" ? id : null,
    }));
  };

  const setCustomName = (name) => {
    setAvatarState((prev) => ({
      ...prev,
      customName: typeof name === "string" && name.trim() ? name.trim() : null,
    }));
    
    // Increment rename count
    setRenameCountState((prev) => {
      const newCount = prev + 1;
      setRenameCount(newCount);
      return newCount;
    });
  };

  const resetAvatar = () => {
    setAvatarState({ ...DEFAULT_AVATAR });
  };

  // Calculate rename cost: First rename is FREE (0 coins), then 100 coins each
  const getRenameCost = () => {
    return renameCount === 0 ? 0 : 100;
  };

  const value = useMemo(
    () => ({ 
      avatar, 
      setBody, 
      setExpression, 
      setHat, 
      setCustomName, 
      resetAvatar,
      getRenameCount: () => renameCount,
      getRenameCost,
    }),
    [avatar, renameCount]
  );

  return (
    <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>
  );
}

export function useAvatar() {
  const context = useContext(AvatarContext);
  if (!context) {
    throw new Error("useAvatar must be used within AvatarProvider");
  }
  return context;
}