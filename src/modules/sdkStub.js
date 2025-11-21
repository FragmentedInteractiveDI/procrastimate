// Replace with a real rewarded-ads SDK later.
// Contract: showRewardedAd() -> Promise<{ watched: boolean, watchedPercent: number, usdValue: number }>
export async function showRewardedAd() {
  // Fake load phase
  await new Promise(r=>setTimeout(r, 500));
  // Fake viewing ~ 5–7s
  const view = 5000 + Math.floor(Math.random()*2000);
  await new Promise(r=>setTimeout(r, view));
  // Simulate completed watch
  return { watched: true, watchedPercent: 1.0, usdValue: 0.01 };
}
