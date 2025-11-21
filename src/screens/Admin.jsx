import { useEffect, useState } from "react";
import { listPayouts, markSent, markFailed, exportPayoutCSV, clearPayouts } from "../modules/payouts";
import { releaseUsdHold } from "../modules/wallet";

export default function Admin({ dark, onToast }) {
  const [items, setItems] = useState(listPayouts());
  const [filter, setFilter] = useState("queued"); // queued | sent | failed | all
  useEffect(()=>{ setItems(listPayouts()); },[]);

  function refresh(){ setItems(listPayouts()); }

  function doMarkSent(id){
    const it = items.find(x=>x.id===id);
    if (!it) return;
    markSent(id, "BATCH-ID");
    // funds leave system
    releaseUsdHold(it.amount, true);
    refresh();
    onToast?.(`Marked sent: $${it.net.toFixed(2)} to ${it.email}`);
  }
  function doMarkFailed(id){
    const it = items.find(x=>x.id===id);
    if (!it) return;
    markFailed(id, "Manual fail");
    // return funds to USD
    releaseUsdHold(it.amount, false);
    refresh();
    onToast?.(`Marked failed: $${it.amount.toFixed(2)} returned to user USD`);
  }
  function downloadCSV(){
    const csv = exportPayoutCSV();
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "payouts.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const rows = items.filter(x=> filter==="all" ? true : x.status===filter);

  return (
    <div className={`rounded-2xl p-6 shadow border ${dark? "bg-stone-800 border-stone-700":"bg-white border-amber-200/60"}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Admin • Payouts</h2>
        <div className="flex gap-2">
          <select value={filter} onChange={e=>setFilter(e.target.value)}
            className={`px-3 py-2 rounded-lg text-sm ${dark?"bg-stone-700":"bg-amber-50"}`}>
            <option value="queued">queued</option>
            <option value="sent">sent</option>
            <option value="failed">failed</option>
            <option value="all">all</option>
          </select>
          <button onClick={downloadCSV} className="px-3 py-2 rounded-lg text-sm bg-amber-500 hover:bg-amber-600 text-white">Export CSV</button>
          <button onClick={()=>{ if(confirm("Clear payout queue?")) { clearPayouts(); refresh(); } }}
            className="px-3 py-2 rounded-lg text-sm bg-slate-300">Clear</button>
        </div>
      </div>

      <div className={`rounded-xl ${dark?"bg-stone-700":"bg-amber-50"}`}>
        <TableHeader dark={dark} />
        {rows.length===0 && <div className="p-4 text-sm opacity-70">No items.</div>}
        {rows.map(x=>(
          <div key={x.id} className={`grid grid-cols-7 gap-2 items-center px-3 py-2 border-t ${dark?"border-stone-600":"border-amber-200"}`}>
            <Cell>{new Date(x.createdAt).toLocaleString()}</Cell>
            <Cell className="truncate">{x.email}</Cell>
            <Cell>${x.amount.toFixed(2)}</Cell>
            <Cell>${x.fee.toFixed(2)}</Cell>
            <Cell>${x.net.toFixed(2)}</Cell>
            <Cell>{x.status}</Cell>
            <div className="flex gap-2 justify-end">
              {x.status==="queued" && (
                <>
                  <button onClick={()=>doMarkSent(x.id)} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs">Mark Sent</button>
                  <button onClick={()=>doMarkFailed(x.id)} className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs">Fail</button>
                </>
              )}
              {x.status!=="queued" && <span className="text-xs opacity-70">{x.txnId||"-"}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableHeader({ dark }) {
  return (
    <div className={`grid grid-cols-7 gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${dark?"text-stone-300":"text-slate-600"}`}>
      <div>Created</div><div>Email</div><div>Amount</div><div>Fee</div><div>Net</div><div>Status</div><div className="text-right">Actions</div>
    </div>
  );
}
function Cell({ children, className="" }) {
  return <div className={`text-sm ${className}`}>{children}</div>;
}
