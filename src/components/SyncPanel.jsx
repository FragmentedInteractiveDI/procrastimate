import React, { useEffect, useState, useRef } from "react";
import {
  getBackupSnapshot,
  restoreBackupSnapshot,
  getLastSync,
  setLastSync,
  getPendingCounts
} from "../modules/sync";

export default function SyncPanel({ dark = true }) {
  const [lastSync, setLS] = useState(getLastSync());
  const [pending, setPending] = useState(getPendingCounts());
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => {
      setPending(getPendingCounts());
      setLS(getLastSync());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function saveTextAsFile(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function doExport() {
    const snap = getBackupSnapshot();
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    saveTextAsFile(`ProcrastiMate-backup-${ts}.json`, snap);
    setMsg("Backup exported.");
    setTimeout(() => setMsg(""), 2000);
  }

  async function doImport(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const snap = JSON.parse(text);
      const r = restoreBackupSnapshot(snap);
      if (r.ok) {
        setMsg("Backup restored.");
        setLS(getLastSync());
        setTimeout(() => location.reload(), 600);
      } else {
        setMsg(r.msg || "Restore failed.");
      }
    } catch {
      setMsg("Invalid JSON file.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function markSyncedNow() {
    setLastSync(Date.now());
    setLS(getLastSync());
    setMsg("Sync marked complete.");
    setTimeout(() => setMsg(""), 1500);
  }

  const cardStyle = {
    borderRadius: 12,
    padding: 16,
    border: `1px solid ${dark ? "#444" : "#ddd"}`,
    background: dark ? "#1f2937" : "#f9fafb"
  };

  const pill = (label, value) => (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      background: dark ? "#374151" : "#e5e7eb",
      marginRight: 8
    }}>
      <span style={{ opacity: 0.8, fontSize: 12 }}>{label}</span>
      <b>{value}</b>
    </div>
  );

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: 0, marginBottom: 8, fontSize: 16, fontWeight: 700 }}>Data & Backup</h3>
      <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 10 }}>
        Last sync: {lastSync ? new Date(lastSync).toLocaleString() : "never"}
      </div>

      <div style={{ marginBottom: 12 }}>
        {pill("Pending (total)", pending.total)}
        {pill("Wallet ops", pending.wallet)}
        {pill("Stats ops", pending.stats)}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={doExport} style={btnStyle(dark)}>Export backup</button>
        <label style={btnStyle(dark, true)}>
          Import backup
          <input ref={fileRef} type="file" accept="application/json" onChange={doImport} style={{ display: "none" }} />
        </label>
        <button onClick={markSyncedNow} style={btnStyle(dark)}>Mark as synced</button>
      </div>

      {msg && <div style={{ marginTop: 10, fontSize: 13, color: dark ? "#34d399" : "#065f46" }}>{msg}</div>}
    </div>
  );
}

function btnStyle(dark, asLabel = false) {
  return {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${dark ? "#555" : "#ccc"}`,
    background: dark ? "#111827" : "#ffffff",
    color: dark ? "#e5e7eb" : "#111827",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    ...(asLabel ? { userSelect: "none" } : null)
  };
}
