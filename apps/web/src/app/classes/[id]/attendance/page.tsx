"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import { db } from "@/lib/db";
import type { StudentRecord } from "@/lib/types";

const TIME_SLOTS = [
  "09:00-09:55",
  "09:55-10:50",
  "11:10-12:05",
  "12:05-13:00",
  "13:00-13:55",
  "13:55-14:50",
  "14:50-15:45",
  "15:45-16:40"
];

type AttendanceSession = {
  id: string;
  date: string;
  time_slot: string;
  period_count: number;
};

export default function AttendancePage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const { session } = useAuth();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0]);
  const [periodCount, setPeriodCount] = useState("1");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = session?.user.id ?? "";

  async function loadStudents() {
    if (db) {
      const local = await db.students
        .where({ class_id: classId })
        .and((item) => item.deleted_at === null)
        .toArray();
      if (local.length > 0) {
        setStudents(local as StudentRecord[]);
      }
    }

    if (!navigator.onLine) {
      return;
    }

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .is("deleted_at", null)
      .order("roll_no", { ascending: true });
    if (error) {
      setStatus(error.message);
      return;
    }
    const rows = (data ?? []) as StudentRecord[];
    setStudents(rows);
    if (db && rows.length > 0) {
      await db.students.bulkPut(rows);
    }
  }

  async function loadSessions() {
    if (db) {
      const local = await db.attendance_sessions
        .where({ class_id: classId })
        .and((item) => item.deleted_at === null)
        .toArray();
      if (local.length > 0) {
        setSessions(local as AttendanceSession[]);
      }
    }

    if (!navigator.onLine) {
      return;
    }

    const { data, error } = await supabase
      .from("attendance_sessions")
      .select("id,date,time_slot,period_count,updated_at,deleted_at,class_id,owner_id,created_at")
      .eq("class_id", classId)
      .is("deleted_at", null)
      .order("date", { ascending: false });
    if (error) {
      setStatus(error.message);
      return;
    }
    const rows = (data ?? []) as AttendanceSession[];
    setSessions(rows);
    if (db && rows.length > 0) {
      await db.attendance_sessions.bulkPut(rows as unknown as Record<string, unknown>[]);
    }
  }

  async function loadAttendance(sessionId: string) {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("student_id,status")
      .eq("session_id", sessionId);
    if (error) {
      setStatus(error.message);
      return;
    }
    const absent = new Set<string>();
    for (const record of data ?? []) {
      if (record.status === "A") {
        absent.add(record.student_id);
      }
    }
    setAbsentIds(absent);
  }

  useEffect(() => {
    Promise.all([loadStudents(), loadSessions()]).finally(() => setLoading(false));
  }, []);

  const totalAbsent = useMemo(() => absentIds.size, [absentIds]);
  const totalPresent = useMemo(
    () => Math.max(students.length - absentIds.size, 0),
    [students.length, absentIds.size]
  );
  const lastSession = useMemo(() => {
    if (sessions.length === 0) return null;
    const sorted = [...sessions].sort((a, b) => {
      if (a.date === b.date) {
        return a.time_slot.localeCompare(b.time_slot);
      }
      return a.date.localeCompare(b.date);
    });
    return sorted[sorted.length - 1];
  }, [sessions]);

  async function handleOpenSession() {
    setStatus(null);
    if (!userId) {
      setStatus("You are not signed in.");
      return;
    }
    if (students.length === 0) {
      setStatus("No students found for this class. Add students or sync from cloud.");
      return;
    }
    if (editingSessionId) {
      const { data: updated, error: updateError } = await supabase
        .from("attendance_sessions")
        .update({
          date,
          time_slot: timeSlot,
          period_count: Number(periodCount)
        })
        .eq("id", editingSessionId)
        .select("id,date,time_slot,period_count")
        .single();
      if (updateError) {
        setStatus(updateError.message);
        return;
      }
      setActiveSession(updated as AttendanceSession);
      setEditingSessionId(null);
      await loadSessions();
      return;
    }
    const { data: existing, error } = await supabase
      .from("attendance_sessions")
      .select("id,date,time_slot,period_count")
      .eq("class_id", classId)
      .eq("date", date)
      .eq("time_slot", timeSlot)
      .maybeSingle();
    if (error) {
      setStatus(error.message);
      return;
    }
    if (existing) {
      setActiveSession(existing as AttendanceSession);
      await loadAttendance(existing.id);
      return;
    }

    const now = new Date().toISOString();
    const { data, error: insertError } = await supabase
      .from("attendance_sessions")
      .insert({
        owner_id: userId,
        class_id: classId,
        date,
        time_slot: timeSlot,
        period_count: Number(periodCount),
        created_at: now,
        updated_at: now
      })
      .select("id,date,time_slot,period_count")
      .single();
    if (insertError) {
      setStatus(insertError.message);
      return;
    }
    setActiveSession(data as AttendanceSession);
    setAbsentIds(new Set());
    if (db && data) {
      await db.attendance_sessions.put({
        ...data,
        owner_id: userId,
        class_id: classId,
        created_at: now,
        updated_at: now,
        deleted_at: null
      } as unknown as Record<string, unknown>);
    }
    await loadSessions();
  }

  async function handleEditSession(session: AttendanceSession) {
    setEditingSessionId(session.id);
    setActiveSession(session);
    setDate(session.date);
    setTimeSlot(session.time_slot);
    setPeriodCount(String(session.period_count ?? 1));
    await loadAttendance(session.id);
  }

  async function handleDeleteSession(session: AttendanceSession) {
    const confirmed = window.confirm("Delete this attendance session? This cannot be undone.");
    if (!confirmed) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("attendance_sessions")
      .update({ deleted_at: now })
      .eq("id", session.id);
    if (error) {
      setStatus(error.message);
      return;
    }
    if (db) {
      await db.attendance_sessions.update(session.id, { deleted_at: now, updated_at: now } as Record<string, unknown>);
    }
    if (activeSession?.id === session.id) {
      setActiveSession(null);
      setEditingSessionId(null);
      setAbsentIds(new Set());
    }
    await loadSessions();
  }

  async function handleSaveAttendance() {
    if (!activeSession) return;
    setStatus(null);
    if (students.length === 0) {
      setStatus("No students found for this class.");
      return;
    }
    const records = students.map((student) => ({
      owner_id: userId,
      session_id: activeSession.id,
      student_id: student.id,
      status: absentIds.has(student.id) ? "A" : "P"
    }));
    const { error } = await supabase.from("attendance_records").upsert(records, {
      onConflict: "session_id,student_id"
    });
    if (error) {
      setStatus(error.message);
    } else {
      setStatus("Attendance saved.");
    }
  }

  async function handleDuplicateAbsent(sessionId: string) {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("student_id,status")
      .eq("session_id", sessionId)
      .eq("status", "A");
    if (error) {
      setStatus(error.message);
      return;
    }
    setAbsentIds(new Set((data ?? []).map((item) => item.student_id)));
  }

  return (
    <RequireAuth>
      <AppShell title="Take Attendance">
        <Card>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <label className="text-sm text-slate-600">
              Date
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="text-sm text-slate-600">
              Time slot
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={timeSlot}
                onChange={(event) => setTimeSlot(event.target.value)}
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Period count
              <Input
                type="number"
                min={1}
                max={4}
                value={periodCount}
                onChange={(event) => setPeriodCount(event.target.value)}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="button" onClick={handleOpenSession}>
                {editingSessionId ? "Update session" : "Open session"}
              </Button>
              <Button type="button" variant="secondary" onClick={handleSaveAttendance} disabled={!activeSession}>
                Save
              </Button>
            </div>
            {status ? <p className="text-sm text-slate-600 md:col-span-4">{status}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span>Students: {students.length}</span>
            <span>Present: {totalPresent}</span>
            <span>Absent: {totalAbsent}</span>
            <span>Session: {activeSession ? `${activeSession.date} ${activeSession.time_slot}` : "None"}</span>
            <span>
              Previous:{" "}
              {lastSession ? `${lastSession.date} ${lastSession.time_slot}` : "No previous session"}
            </span>
            {sessions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Duplicate absent from:</span>
                {sessions.slice(0, 3).map((session) => (
                  <Button
                    key={session.id}
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDuplicateAbsent(session.id)}
                  >
                    {session.date} {session.time_slot}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {sessions.length > 0 ? (
          <Card>
            <CardContent className="grid gap-3">
              <div className="text-sm font-semibold text-slate-600">Past sessions</div>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-semibold text-ink">{session.date}</span>{" "}
                    <span className="text-slate-500">{session.time_slot}</span>{" "}
                    <span className="text-slate-400">({session.period_count} period)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleEditSession(session)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteSession(session)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {students.length === 0 ? (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span>No students found for this class.</span>
              <Button size="sm" variant="secondary" onClick={() => (window.location.href = `/classes/${classId}/students`)}>
                Add students
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">Loading students...</p> : null}
        <div className="grid gap-3">
          {students.map((student) => {
            const absent = absentIds.has(student.id);
            return (
              <Card key={student.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-ink">{student.name}</h3>
                    <p className="text-sm text-slate-500">Roll {student.roll_no ?? "—"}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={absent ? "destructive" : "secondary"}
                    onClick={() => {
                      const next = new Set(absentIds);
                      if (absent) {
                        next.delete(student.id);
                      } else {
                        next.add(student.id);
                      }
                      setAbsentIds(next);
                    }}
                  >
                    {absent ? "Absent" : "Present"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-md">
          <div className="text-sm text-slate-600">
            Present: {totalPresent} · Absent: {totalAbsent}
          </div>
          <Button type="button" onClick={handleSaveAttendance} disabled={!activeSession}>
            Save attendance
          </Button>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
