"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { db } from "@/lib/db";
import { queueOutbox } from "@/lib/sync";
import type { StudentRecord } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";

const emptyForm = {
  roll_no: "",
  name: "",
  email: "",
  phone: ""
};

export default function StudentsPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const { session } = useAuth();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id ?? "";

  async function loadLocal() {
    if (!db) return;
    const localStudents = await db.students
      .where({ class_id: classId })
      .and((item) => item.deleted_at === null)
      .toArray();
    setStudents(localStudents);
  }

  async function loadRemote() {
    if (!session) return;
    const { data, error: fetchError } = await supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .is("deleted_at", null)
      .order("roll_no", { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    if (db && data) {
      await db.students.bulkPut(data as StudentRecord[]);
    }
    setStudents((data ?? []) as StudentRecord[]);
  }

  useEffect(() => {
    loadLocal().then(() => setLoading(false));
    if (navigator.onLine) {
      loadRemote();
    }
  }, [session]);

  const submitLabel = useMemo(() => (editingId ? "Update student" : "Add student"), [editingId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError(null);
    const now = new Date().toISOString();
    const id = editingId ?? crypto.randomUUID();
    const record: StudentRecord = {
      id,
      owner_id: userId,
      class_id: classId,
      roll_no: form.roll_no || null,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      created_at: editingId ? students.find((item) => item.id === editingId)?.created_at ?? now : now,
      updated_at: now,
      deleted_at: null
    };

    if (db) {
      await db.students.put(record);
    }

    if (navigator.onLine) {
      const { error: upsertError } = await supabase.from("students").upsert(record, { onConflict: "id" });
      if (upsertError) {
        await queueOutbox({
          table: "students",
          action: editingId ? "update" : "insert",
          record_id: id,
          payload: record,
          created_at: now
        });
        setError(upsertError.message);
      }
    } else {
      await queueOutbox({
        table: "students",
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

  async function handleEdit(item: StudentRecord) {
    setEditingId(item.id);
    setForm({
      roll_no: item.roll_no ?? "",
      name: item.name,
      email: item.email ?? "",
      phone: item.phone ?? ""
    });
  }

  async function handleDelete(item: StudentRecord) {
    if (!db) return;
    const now = new Date().toISOString();
    await db.students.update(item.id, { deleted_at: now, updated_at: now });
    await loadLocal();

    if (navigator.onLine) {
      const { error: updateError } = await supabase
        .from("students")
        .update({ deleted_at: now })
        .eq("id", item.id);
      if (updateError) {
        await queueOutbox({
          table: "students",
          action: "delete",
          record_id: item.id,
          payload: { deleted_at: now },
          created_at: now
        });
        setError(updateError.message);
      }
    } else {
      await queueOutbox({
        table: "students",
        action: "delete",
        record_id: item.id,
        payload: { deleted_at: now },
        created_at: now
      });
    }
  }

  async function handleCsvImport(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      setError("CSV must include a header row and at least one student.");
      return;
    }
    const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
    const required = ["roll_no", "name", "email", "phone"];
    const missing = required.filter((field) => !header.includes(field));
    if (missing.length > 0) {
      setError(`Missing columns: ${missing.join(", ")}`);
      return;
    }

    const indexMap = required.reduce<Record<string, number>>((acc, field) => {
      acc[field] = header.indexOf(field);
      return acc;
    }, {});

    const now = new Date().toISOString();
    const records: StudentRecord[] = lines.slice(1).map((line) => {
      const cols = line.split(",");
      return {
        id: crypto.randomUUID(),
        owner_id: userId,
        class_id: classId,
        roll_no: cols[indexMap.roll_no]?.trim() || null,
        name: cols[indexMap.name]?.trim() || "",
        email: cols[indexMap.email]?.trim() || null,
        phone: cols[indexMap.phone]?.trim() || null,
        created_at: now,
        updated_at: now,
        deleted_at: null
      };
    });

    if (db) {
      await db.students.bulkPut(records);
    }

    if (navigator.onLine) {
      const { error: insertError } = await supabase.from("students").upsert(records, { onConflict: "id" });
      if (insertError) {
        for (const record of records) {
          await queueOutbox({
            table: "students",
            action: "insert",
            record_id: record.id,
            payload: record,
            created_at: now
          });
        }
        setError(insertError.message);
      }
    } else {
      for (const record of records) {
        await queueOutbox({
          table: "students",
          action: "insert",
          record_id: record.id,
          payload: record,
          created_at: now
        });
      }
    }

    await loadLocal();
  }

  function handleDownloadTemplate() {
    const csv = "roll_no,name,email,phone\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "students_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <RequireAuth>
      <AppShell title="Students">
        <Card>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-4" onSubmit={handleSubmit}>
              <Input
                placeholder="Roll number"
                value={form.roll_no}
                onChange={(event) => setForm({ ...form, roll_no: event.target.value })}
              />
              <Input
                placeholder="Student name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
              <Input
                placeholder="Email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
              <Input
                placeholder="Phone"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
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
                <label className="text-sm text-slate-600">
                  <span className="mr-2 font-semibold">Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        handleCsvImport(file);
                        event.target.value = "";
                      }
                    }}
                  />
                </label>
                <Button type="button" variant="secondary" onClick={handleDownloadTemplate}>
                  Download template
                </Button>
                {error ? <span className="text-sm text-rose-600">{error}</span> : null}
              </div>
            </form>
          </CardContent>
        </Card>

        {loading ? <p className="text-sm text-slate-500">Loading students...</p> : null}
        <div className="grid gap-3">
          {students.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-ink">{item.name}</h3>
                  <p className="text-sm text-slate-500">
                    Roll {item.roll_no ?? "—"} · {item.email ?? "No email"} · {item.phone ?? "No phone"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleEdit(item)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(item)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {!loading && students.length === 0 ? (
          <p className="text-sm text-slate-500">No students yet. Add or import them above.</p>
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}
