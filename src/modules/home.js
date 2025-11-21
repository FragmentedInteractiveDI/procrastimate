import { ls } from "./ls";
import { listCatalog } from "./store";
import { businessBonusFromIds } from "./store";

const KEY = "pm_home_v1";
const W = 6, H = 6;

function def() {
  return {
    w: W, h: H,
    cells: Array.from({ length: W*H }, () => null), // item ids or null
  };
}

function idx(x, y, w=W) { return y*w + x; }
function inside(x,y){ return x>=0 && y>=0 && x<W && y<H; }

function load(){ return ls.get(KEY, def()); }
function save(s){ ls.set(KEY, s); return s; }

export function getHome(){ return load(); }

export function clearAt(x,y){
  const s = load();
  if (!inside(x,y)) return { ok:false };
  s.cells[idx(x,y,s.w)] = null;
  save(s); return { ok:true };
}

export function placeAt(x,y,itemId){
  const s = load();
  if (!inside(x,y)) return { ok:false, msg:"Out of bounds" };
  const catalog = listCatalog();
  const item = catalog.find(i => i.id === itemId);
  if (!item) return { ok:false, msg:"Unknown item" };
  s.cells[idx(x,y,s.w)] = itemId;
  save(s); return { ok:true };
}

export function placeBusinessRandom(businessId){
  const s = load();
  const empties = [];
  for (let y=0;y<s.h;y++) for (let x=0;x<s.w;x++) {
    if (!s.cells[idx(x,y,s.w)]) empties.push([x,y]);
  }
  if (!empties.length) return { ok:false, msg:"No space" };
  const [x,y] = empties[Math.floor(Math.random()*empties.length)];
  s.cells[idx(x,y,s.w)] = businessId;
  save(s);
  return { ok:true, x, y };
}

export function getPlacedBusinessIds(){
  const s = load();
  return s.cells.filter(Boolean).filter(id => id.startsWith("biz_"));
}

export function calcBusinessBonus(){
  const ids = getPlacedBusinessIds();
  return businessBonusFromIds(ids); // capped inside store
}
