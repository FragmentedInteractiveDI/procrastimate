import { ls } from "./ls.js";
import { loadWallet, lockUsd, releaseUsdHold } from "./wallet.js";

const KEY = "pm_payouts_v1";

const now = () => Date.now();
const load = () => ls.get(KEY, []);
const save = (q) => { ls.set(KEY, q); return q; };

export function listPayouts(){ return load(); }

export function requestPayout(amount){
  const w = loadWallet();
  if (!w.profile?.verified) return { ok:false, msg:"Verify PayPal and age 18+ first." };
  if (amount <= 0 || amount > w.usd.available) return { ok:false, msg:"Invalid amount." };

  const r = lockUsd(amount);
  if (!r.ok) return r;

  const q = load();
  const item = {
    id: Math.random().toString(36).slice(2),
    amount,
    email: w.profile.paypalEmail,
    status: "queued",               // queued | sent | failed
    createdAt: now(),
    updatedAt: now()
  };
  q.unshift(item); save(q);
  return { ok:true, item };
}

export function markPayoutSent(id){
  const q = load();
  const it = q.find(x=>x.id===id);
  if (!it || it.status !== "queued") return { ok:false, msg:"Not found/invalid state." };
  it.status = "sent"; it.updatedAt = now();
  releaseUsdHold(it.amount, true);  // remove from hold permanently
  save(q);
  return { ok:true };
}

export function markPayoutFailed(id){
  const q = load();
  const it = q.find(x=>x.id===id);
  if (!it || it.status !== "queued") return { ok:false, msg:"Not found/invalid state." };
  it.status = "failed"; it.updatedAt = now();
  releaseUsdHold(it.amount, false); // return to available
  save(q);
  return { ok:true };
}

export function exportPayoutCSV(){
  const rows = [["id","amount","email","status","createdAt","updatedAt"]];
  for (const p of load()){
    rows.push([p.id, p.amount, p.email, p.status,
      new Date(p.createdAt).toISOString(),
      new Date(p.updatedAt).toISOString()]);
  }
  return rows.map(r=>r.map(x=>String(x).replaceAll('"','""'))
    .map(x=>`"${x}"`).join(",")).join("\n");
}
