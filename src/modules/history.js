import { ls } from "./ls.js";

const KEY = "pm_history_v1";

function now(){ return Date.now(); }
function load(){ return ls.get(KEY, []); }
function save(arr){ ls.set(KEY, arr); return arr; }

export function logEvent(evt){
  const arr = load();
  arr.unshift({ id: Math.random().toString(36).slice(2), t: now(), ...evt });
  return save(arr.slice(0, 500)); // keep last 500
}

export function getHistory(){ return load(); }

export function exportCSV(){
  const rows = [["time","type","desc","coins","usd"]];
  for(const e of load()){
    rows.push([new Date(e.t).toISOString(), e.type, e.desc||"", e.deltaCoins??"", e.deltaUSD??""]);
  }
  const csv = rows.map(r=>r.map(x=>String(x).replaceAll('"','""')).map(x=>`"${x}"`).join(",")).join("\n");
  return csv;
}
