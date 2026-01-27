"use client";

import { useEffect, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { getLastSync, getPendingCount, syncNow } from "@/lib/sync";

export function SyncStatus() {
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLastSync(await getLastSync());
    setPending(await getPendingCount());
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function handleSync() {
    setBusy(true);
    await syncNow();
    await refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
      <Badge className={online ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
        {online ? "Online" : "Offline"}
      </Badge>
      <span>Last sync: {lastSync ? new Date(lastSync).toLocaleString() : "Never"}</span>
      <span>Pending: {pending}</span>
      <Button size="sm" variant="secondary" onClick={handleSync} disabled={busy}>
        {busy ? "Syncing..." : "Sync now"}
      </Button>
    </div>
  );
}
