"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { db } from "@/lib/db";
import { queueOutbox, syncNow } from "@/lib/sync";
import type { ClassRecord } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";

const emptyForm = {
  subject_name: "",
  semester: "",
  section: "",
  academic_year: ""
};

export default function ClassesPage() {
  const { session } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id ?? "";

  async function loadLocal() {
    if (!db) return;
    const localClasses = await db.classes.filter((item) => item.deleted_at === null).toArray();
    setClasses(localClasses);
  }

  async function loadRemote() {
    if (!session) return;
    const { data, error: fetchError } = await supabase
      .from("classes")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    if (db && data) {
      await db.classes.bulkPut(data as ClassRecord[]);
    }
    setClasses((data ?? []) as ClassRecord[]);
  }

  useEffect(() => {
    loadLocal().then(() => setLoading(false));
    if (navigator.onLine) {
      loadRemote();
    }
  }, [session]);

  const submitLabel = useMemo(() => (editingId ? "Update class" : "Add class"), [editingId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError(null);
    const now = new Date().toISOString();
    const id = editingId ?? crypto.randomUUID();
    const record: ClassRecord = {
      id,
      owner_id: userId,
      subject_name: form.subject_name,
      semester: form.semester,
      section: form.section,
      academic_year: form.academic_year,
      created_at: editingId ? classes.find((item) => item.id === editingId)?.created_at ?? now : now,
      updated_at: now,
      deleted_at: null
    };

    if (db) {
      await db.classes.put(record);
    }

    if (navigator.onLine) {
      const { error: upsertError } = await supabase.from("classes").upsert(record, { onConflict: "id" });
      if (upsertError) {
        await queueOutbox({
          table: "classes",
          action: editingId ? "update" : "insert",
          record_id: id,
          payload: record,
          created_at: now
        });
        setError(upsertError.message);
      }
    } else {
      await queueOutbox({
        table: "classes",
        action: editingId ? "update" : "insert",
        record_id: id,
        payload: record,
        created_at: now
      });
    }

    setForm(emptyForm);
    setEditingId(null);
    await loadLocal();
  }

  async function handleEdit(item: ClassRecord) {
    setEditingId(item.id);
    setForm({
      subject_name: item.subject_name,
      semester: item.semester,
      section: item.section,
      academic_year: item.academic_year
    });
  }

  async function handleDelete(item: ClassRecord) {
    if (!db) return;
    const now = new Date().toISOString();
    await db.classes.update(item.id, { deleted_at: now, updated_at: now });
    await loadLocal();

    if (navigator.onLine) {
      const { error: updateError } = await supabase
        .from("classes")
        .update({ deleted_at: now })
        .eq("id", item.id);
      if (updateError) {
        await queueOutbox({
          table: "classes",
          action: "delete",
          record_id: item.id,
          payload: { deleted_at: now },
          created_at: now
        });
        setError(updateError.message);
      }
    } else {
      await queueOutbox({
        table: "classes",
        action: "delete",
        record_id: item.id,
        payload: { deleted_at: now },
        created_at: now
      });
    }
  }

  async function handleSync() {
    await syncNow();
    await loadLocal();
  }

  return (
    <RequireAuth>
      <AppShell title="Your Classes">
        <Card>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-4" onSubmit={handleSubmit}>
              <Input
                placeholder="Subject name"
                value={form.subject_name}
                onChange={(event) => setForm({ ...form, subject_name: event.target.value })}
                required
              />
              <Input
                placeholder="Semester"
                value={form.semester}
                onChange={(event) => setForm({ ...form, semester: event.target.value })}
                required
              />
              <Input
                placeholder="Section/Batch"
                value={form.section}
                onChange={(event) => setForm({ ...form, section: event.target.value })}
                required
              />
              <Input
                placeholder="Academic year"
                value={form.academic_year}
                onChange={(event) => setForm({ ...form, academic_year: event.target.value })}
                required
              />
              <div className="md:col-span-4 flex items-center gap-3">
                <Button type="submit">{submitLabel}</Button>
                {editingId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm);
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={handleSync}>
                  Refresh from cloud
                </Button>
                {error ? <span className="text-sm text-rose-600">{error}</span> : null}
              </div>
            </form>
          </CardContent>
        </Card>

        {loading ? <p className="text-sm text-slate-500">Loading classes...</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {classes.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-ink">{item.subject_name}</h3>
                  <p className="text-sm text-slate-500">
                    Semester {item.semester} · Section {item.section} · {item.academic_year}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleEdit(item)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(item)}>
                    Delete
                  </Button>
                  <Link href={`/classes/${item.id}/students`}>
                    <Button size="sm" variant="secondary">Manage students</Button>
                  </Link>
                  <Link href={`/classes/${item.id}/attendance`}>
                    <Button size="sm" variant="primary">Take attendance</Button>
                  </Link>
                  <Link href={`/classes/${item.id}/reports`}>
                    <Button size="sm" variant="secondary">Reports</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {!loading && classes.length === 0 ? (
          <p className="text-sm text-slate-500">No classes yet. Create your first class above.</p>
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}
