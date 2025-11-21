// src/components/ui.jsx
import { forwardRef, useEffect, useRef, useState } from "react";

/* ---------- Screen header ---------- */
export function ScreenHeader({ title = "", children }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/* ---------- Card ---------- */
export function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-xl p-4 border shadow-sm bg-white text-slate-800 border-amber-200/70 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600 ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------- Stat row ---------- */
export function StatRow({ label = "", value = "", sub = "" }) {
  return (
    <div>
      {label ? <div className="text-xs opacity-70">{label}</div> : null}
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-xs opacity-70">{sub}</div> : null}
    </div>
  );
}

/* ---------- Small icon-like button ---------- */
export const IconButton = forwardRef(function IconButton(
  { label = "", className = "", children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      aria-label={label || "info"}
      className={`h-7 w-7 rounded-full border text-xs flex items-center justify-center bg-amber-50 text-amber-900 dark:bg-stone-700 dark:text-amber-200 dark:border-stone-500 ${className}`}
      {...props}
    >
      {children ?? "?"}
    </button>
  );
});

/* ---------- Popover anchored to a button ---------- */
export function Popover({ anchorRef, open, onClose, children }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function place() {
      const a = anchorRef?.current;
      const p = popRef.current;
      if (!a || !p) return;
      const r = a.getBoundingClientRect();
      const pw = p.offsetWidth;
      const ph = p.offsetHeight;

      // default below and centered
      let top = r.bottom + 8;
      let left = r.left + r.width / 2 - pw / 2;

      // clamp inside viewport
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      left = Math.max(8, Math.min(left, vw - pw - 8));
      if (top + ph + 8 > vh) top = Math.max(8, r.top - ph - 8);

      setPos({ top, left });
    }
    place();
    const ro = new ResizeObserver(place);
    if (anchorRef?.current) ro.observe(anchorRef.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    function onDoc(e) {
      if (!popRef.current) return;
      if (
        !popRef.current.contains(e.target) &&
        !anchorRef?.current?.contains(e.target)
      ) onClose?.();
    }
    function onEsc(e) { if (e.key === "Escape") onClose?.(); }

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-modal="true"
      className="fixed z-50 w-72 rounded-lg border bg-white p-3 text-sm shadow-lg dark:border-stone-600 dark:bg-stone-800"
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
    >
      {children}
    </div>
  );
}
