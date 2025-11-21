import { getMultiplier, getRemainingMs, fmtMMSS } from "../modules/boost";

export default function BoostBadge() {
  const mult = getMultiplier();
  const remaining = getRemainingMs();
  if (mult <= 1 || remaining <= 0) return null;
  return (
    <div className="fixed bottom-4 right-4 rounded-lg bg-white/90 dark:bg-neutral-900/90 px-3 py-2 text-sm shadow">
      <span className="font-semibold">Boost x{mult}</span> — {fmtMMSS(remaining)}
    </div>
  );
}
