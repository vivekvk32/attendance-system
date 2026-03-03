"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const PERIOD_COUNT_MIN = 1;
const PERIOD_COUNT_MAX = 4;
const SLOT_SEPARATOR = " + ";

function parsePeriodCount(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return PERIOD_COUNT_MIN;
  }
  return Math.min(Math.max(parsed, PERIOD_COUNT_MIN), PERIOD_COUNT_MAX);
}

function normalizeSlots(slots: string[]) {
  const unique = new Set(slots.filter((slot) => TIME_SLOTS.includes(slot)));
  return [...unique].sort((a, b) => TIME_SLOTS.indexOf(a) - TIME_SLOTS.indexOf(b));
}

function serializeSlots(slots: string[]) {
  return normalizeSlots(slots).join(SLOT_SEPARATOR);
}

function parseStoredSlots(value: string) {
  const rawSlots = value
    .split(/\s*\+\s*|,\s*/)
    .map((slot) => slot.trim())
    .filter(Boolean);
  const knownSlots = normalizeSlots(rawSlots);
  if (knownSlots.length > 0) {
    return knownSlots;
  }
  const fallback = value.trim();
  return fallback ? [fallback] : [];
}

function getDefaultSlots(startSlot: string, count: number) {
  const startIndex = TIME_SLOTS.indexOf(startSlot);
  if (startIndex >= 0) {
    const forward = TIME_SLOTS.slice(startIndex, startIndex + count);
    if (forward.length === count) {
      return forward;
    }
  }
  return TIME_SLOTS.slice(0, count);
}

function sameSlots(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((slot, index) => slot === b[index]);
}

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
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<string[]>([TIME_SLOTS[0]]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(true);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [classId]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  function pushNotice(message: string, tone: "success" | "error") {
    setNotice({ message, tone });
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
    }
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }

  const totalAbsent = useMemo(() => absentIds.size, [absentIds]);
  const totalPresent = useMemo(
    () => Math.max(students.length - absentIds.size, 0),
    [students.length, absentIds.size]
  );
  const periodCountValue = useMemo(() => parsePeriodCount(periodCount), [periodCount]);
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

  useEffect(() => {
    if (periodCountValue <= 1) {
      setSelectedTimeSlots((previous) => (sameSlots(previous, [timeSlot]) ? previous : [timeSlot]));
      return;
    }

    setSelectedTimeSlots((previous) => {
      const normalized = normalizeSlots(previous);
      let next = normalized;

      if (next.length > periodCountValue) {
        next = next.slice(0, periodCountValue);
      } else if (next.length < periodCountValue) {
        const defaults = getDefaultSlots(timeSlot, periodCountValue);
        next = normalizeSlots([...next, ...defaults]).slice(0, periodCountValue);
      }

      return sameSlots(previous, next) ? previous : next;
    });
  }, [periodCountValue, timeSlot]);

  function getSessionTimeSlotPayload() {
    if (periodCountValue <= 1) {
      return { periodCount: 1, timeSlotValue: timeSlot };
    }
    const normalized = normalizeSlots(selectedTimeSlots);
    if (normalized.length !== periodCountValue) {
      setStatus(`Select exactly ${periodCountValue} hours for ${periodCountValue} periods.`);
      return null;
    }
    return {
      periodCount: periodCountValue,
      timeSlotValue: serializeSlots(normalized)
    };
  }

  function applySessionToForm(session: AttendanceSession) {
    const parsedSlots = parseStoredSlots(session.time_slot);
    const safePeriodCount = Math.min(
      Math.max(session.period_count ?? parsedSlots.length ?? PERIOD_COUNT_MIN, PERIOD_COUNT_MIN),
      PERIOD_COUNT_MAX
    );
    const primarySlot = parsedSlots[0] ?? TIME_SLOTS[0];

    setDate(session.date);
    setTimeSlot(primarySlot);
    setPeriodCount(String(safePeriodCount));
    if (safePeriodCount > 1) {
      const knownSlots = normalizeSlots(parsedSlots);
      const defaults = getDefaultSlots(primarySlot, safePeriodCount);
      const nextSlots = normalizeSlots([...knownSlots, ...defaults]).slice(0, safePeriodCount);
      setSelectedTimeSlots(nextSlots);
    } else {
      setSelectedTimeSlots([primarySlot]);
    }
  }

  function handleToggleTimeSlot(slot: string) {
    if (periodCountValue <= 1) {
      setTimeSlot(slot);
      return;
    }
    setSelectedTimeSlots((previous) => {
      if (previous.includes(slot)) {
        return previous.filter((value) => value !== slot);
      }
      if (previous.length >= periodCountValue) {
        return previous;
      }
      return normalizeSlots([...previous, slot]);
    });
  }

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
    const payload = getSessionTimeSlotPayload();
    if (!payload) {
      return;
    }
    if (editingSessionId) {
      const { data: updated, error: updateError } = await supabase
        .from("attendance_sessions")
        .update({
          date,
          time_slot: payload.timeSlotValue,
          period_count: payload.periodCount
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
      .eq("time_slot", payload.timeSlotValue)
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
        time_slot: payload.timeSlotValue,
        period_count: payload.periodCount,
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

  async function handleEditSessionDetails(session: AttendanceSession) {
    setEditingSessionId(session.id);
    setActiveSession(session);
    applySessionToForm(session);
    await loadAttendance(session.id);
  }

  async function handleEditAttendance(session: AttendanceSession) {
    setEditingSessionId(null);
    setActiveSession(session);
    applySessionToForm(session);
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

  async function handleDeleteClass() {
    const confirmed = window.confirm("Delete this class and all its sessions? This cannot be undone.");
    if (!confirmed) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("classes").update({ deleted_at: now }).eq("id", classId);
    if (error) {
      setStatus(error.message);
      return;
    }
    if (db) {
      await db.classes.update(classId, { deleted_at: now, updated_at: now });
    }
    window.location.href = "/classes";
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
      pushNotice(error.message, "error");
    } else {
      setStatus("Attendance saved.");
      pushNotice("Attendance saved.", "success");
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
                min={PERIOD_COUNT_MIN}
                max={PERIOD_COUNT_MAX}
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
              <Button type="button" variant="destructive" onClick={handleDeleteClass}>
                Delete class
              </Button>
            </div>
            {periodCountValue > 1 ? (
              <div className="md:col-span-4">
                <p className="text-sm text-slate-600">
                  Select {periodCountValue} hours ({selectedTimeSlots.length}/{periodCountValue} selected)
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TIME_SLOTS.map((slot) => {
                    const selected = selectedTimeSlots.includes(slot);
                    const disabled = !selected && selectedTimeSlots.length >= periodCountValue;
                    return (
                      <Button
                        key={slot}
                        type="button"
                        size="sm"
                        variant={selected ? "primary" : "secondary"}
                        disabled={disabled}
                        onClick={() => handleToggleTimeSlot(slot)}
                      >
                        {slot}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
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

        <Card>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-600">
              <span>Past sessions</span>
              <Button size="sm" variant="secondary" onClick={loadSessions}>
                Refresh sessions
              </Button>
            </div>
            {sessions.length === 0 ? (
              <p className="text-sm text-slate-500">
                No past sessions found for this class yet.
              </p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-semibold text-ink">{session.date}</span>{" "}
                    <span className="text-slate-500">{session.time_slot}</span>{" "}
                    <span className="text-slate-400">
                      ({session.period_count} {session.period_count === 1 ? "period" : "periods"})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleEditAttendance(session)}>
                      Edit attendance
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleEditSessionDetails(session)}>
                      Edit session
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteSession(session)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

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
        {notice ? (
          <div
            className={`fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg md:inset-auto md:right-6 md:top-6 ${
              notice.tone === "success" ? "bg-emerald-600/90" : "bg-rose-600/90"
            }`}
            role="status"
            aria-live="polite"
            onClick={() => setNotice(null)}
          >
            {notice.message}
          </div>
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}
