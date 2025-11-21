// FILE: src/context/AvatarContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LS_KEY = "pm_avatar_v1";
const defaultEquipped = { hat: null, skin: null };

function readLS() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    const hat = typeof raw?.hat === "string" ? raw.hat : null;
    const skin = typeof raw?.skin === "string" ? raw.skin : null;
    return { hat, skin };
  } catch {
    return { ...defaultEquipped };
  }
}
function writeLS(equipped) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(equipped)); } catch {}
}

const AvatarContext = createContext({
  equipped: defaultEquipped,
  equipHat: (_id) => {},
  equipSkin: (_id) => {},
  setEquipped: (_obj) => {},
  resetEquipped: () => {},
});
AvatarContext.displayName = "AvatarContext";

export function AvatarProvider({ children }) {
  const [equipped, setEquippedState] = useState(() => readLS());

  // persist to LS
  useEffect(() => { writeLS(equipped); }, [equipped]);

  // broadcast lightweight event for listeners (MateBanner, etc.)
  useEffect(() => {
    try {
      window?.dispatchEvent?.(new CustomEvent("pm:avatar:equip", { detail: equipped }));
    } catch {}
  }, [equipped]);

  // actions
  const equipHat = (id) =>
    setEquippedState((prev) => ({ ...prev, hat: typeof id === "string" ? id : null }));

  const equipSkin = (id) =>
    setEquippedState((prev) => ({ ...prev, skin: typeof id === "string" ? id : null }));

  const setEquipped = (obj = {}) =>
    setEquippedState({
      hat: typeof obj.hat === "string" ? obj.hat : null,
      skin: typeof obj.skin === "string" ? obj.skin : null,
    });

  const resetEquipped = () => setEquippedState({ ...defaultEquipped });

  const value = useMemo(
    () => ({ equipped, equipHat, equipSkin, setEquipped, resetEquipped }),
    [equipped]
  );

  return <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>;
}

export function useAvatar() {
  return useContext(AvatarContext);
}
