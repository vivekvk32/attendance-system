"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { supabase } from "@/lib/supabaseClient";
import { SyncStatus } from "./SyncStatus";
import type { ClassRecord } from "@/lib/types";

type AppShellProps = {
  title: string;
  children: React.ReactNode;
};

export function AppShell({ title, children }: AppShellProps) {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClass, setSelectedClass] = useState("");

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    async function loadClasses() {
      const { data } = await supabase
        .from("classes")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as ClassRecord[];
      setClasses(rows);
      if (!selectedClass && rows.length > 0) {
        setSelectedClass(rows[0].id);
      }
    }
    loadClasses();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen app-gradient">
      <header className="sticky top-0 z-10 border-b border-white/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Attendance System
            </p>
            <h1 className="text-xl font-semibold text-ink">{title}</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
            {classes.length > 0 ? (
              <select
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 md:w-auto"
                value={selectedClass}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedClass(value);
                  if (value) {
                    router.push(`/classes/${value}/attendance`);
                  }
                }}
              >
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.subject_name} · {item.section}
                  </option>
                ))}
              </select>
            ) : null}
            <Link className="hover:text-ink" href="/classes">
              Classes
            </Link>
            <Link className="hover:text-ink" href="/analytics">
              Analytics
            </Link>
            <Button size="sm" variant="secondary" onClick={handleSignOut}>
              Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        {!online ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
            You are offline. Changes will sync when you’re back online.
          </div>
        ) : null}
        <SyncStatus />
        {children}
      </main>
    </div>
  );
}
