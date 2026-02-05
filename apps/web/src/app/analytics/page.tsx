"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import type { ClassRecord, StudentRecord } from "@/lib/types";

type AttendanceSession = {
  id: string;
  date: string;
  time_slot: string;
  period_count: number;
};

type AttendanceRecord = {
  session_id: string;
  student_id: string;
  status: "P" | "A";
};

function monthRange(isoMonth: string) {
  const [year, month] = isoMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export default function AnalyticsPage() {
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [allSessions, setAllSessions] = useState<AttendanceSession[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allTimeLoading, setAllTimeLoading] = useState(false);

  useEffect(() => {
    async function loadClasses() {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        setStatus(error.message);
        return;
      }
      const rows = (data ?? []) as ClassRecord[];
      setClasses(rows);
      if (rows.length > 0 && !selectedClassId) {
        setSelectedClassId(rows[0].id);
      }
    }
    loadClasses().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    async function loadClassData() {
      if (!selectedClassId) return;
      setStatus(null);
      const { data: studentRows, error: studentsError } = await supabase
        .from("students")
        .select("*")
        .eq("class_id", selectedClassId)
        .is("deleted_at", null)
        .order("roll_no", { ascending: true });
      if (studentsError) {
        setStatus(studentsError.message);
        return;
      }
      setStudents((studentRows ?? []) as StudentRecord[]);

      const range = monthRange(month);
      const { data: sessionRows, error: sessionError } = await supabase
        .from("attendance_sessions")
        .select("id,date,time_slot,period_count")
        .eq("class_id", selectedClassId)
        .gte("date", range.start)
        .lt("date", range.end)
        .is("deleted_at", null)
        .order("date", { ascending: true });
      if (sessionError) {
        setStatus(sessionError.message);
        return;
      }
      const sessionList = (sessionRows ?? []) as AttendanceSession[];
      setSessions(sessionList);

      if (sessionList.length === 0) {
        setRecords([]);
        return;
      }
      const sessionIds = sessionList.map((s) => s.id);
      const { data: recordRows, error: recordError } = await supabase
        .from("attendance_records")
        .select("session_id,student_id,status")
        .in("session_id", sessionIds);
      if (recordError) {
        setStatus(recordError.message);
        return;
      }
      setRecords((recordRows ?? []) as AttendanceRecord[]);
    }
    loadClassData();
  }, [selectedClassId, month]);

  useEffect(() => {
    async function loadAllTimeData() {
      if (!selectedClassId) return;
      setStatus(null);
      setAllTimeLoading(true);
      const { data: sessionRows, error: sessionError } = await supabase
        .from("attendance_sessions")
        .select("id,date,time_slot,period_count")
        .eq("class_id", selectedClassId)
        .is("deleted_at", null)
        .order("date", { ascending: false });
      if (sessionError) {
        setStatus(sessionError.message);
        setAllTimeLoading(false);
        return;
      }
      const sessionList = (sessionRows ?? []) as AttendanceSession[];
      setAllSessions(sessionList);

      if (sessionList.length === 0) {
        setAllRecords([]);
        setAllTimeLoading(false);
        return;
      }
      const sessionIds = sessionList.map((s) => s.id);
      const { data: recordRows, error: recordError } = await supabase
        .from("attendance_records")
        .select("session_id,student_id,status")
        .in("session_id", sessionIds);
      if (recordError) {
        setStatus(recordError.message);
        setAllTimeLoading(false);
        return;
      }
      setAllRecords((recordRows ?? []) as AttendanceRecord[]);
      setAllTimeLoading(false);
    }
    loadAllTimeData();
  }, [selectedClassId]);

  const sessionDates = useMemo(() => {
    const unique = new Set(sessions.map((s) => s.date));
    return Array.from(unique).sort();
  }, [sessions]);

  const absentBySession = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const record of records) {
      if (record.status === "A") {
        if (!map.has(record.session_id)) {
          map.set(record.session_id, new Set());
        }
        map.get(record.session_id)?.add(record.student_id);
      }
    }
    return map;
  }, [records]);

  const allSessionStats = useMemo(() => {
    const map = new Map<string, { present: number; absent: number; total: number }>();
    for (const record of allRecords) {
      const entry = map.get(record.session_id) ?? { present: 0, absent: 0, total: 0 };
      if (record.status === "A") {
        entry.absent += 1;
      } else {
        entry.present += 1;
      }
      entry.total += 1;
      map.set(record.session_id, entry);
    }
    return map;
  }, [allRecords]);

  const allAbsentBySession = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const record of allRecords) {
      if (record.status === "A") {
        if (!map.has(record.session_id)) {
          map.set(record.session_id, new Set());
        }
        map.get(record.session_id)?.add(record.student_id);
      }
    }
    return map;
  }, [allRecords]);

  const allSessionWeights = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of allSessions) {
      map.set(session.id, session.period_count || 1);
    }
    return map;
  }, [allSessions]);

  const allSessionsSorted = useMemo(() => {
    return [...allSessions].sort((a, b) => {
      if (a.date === b.date) {
        return a.time_slot.localeCompare(b.time_slot);
      }
      return b.date.localeCompare(a.date);
    });
  }, [allSessions]);

  const allTotals = useMemo(() => {
    let present = 0;
    let absent = 0;
    let total = 0;
    for (const stats of allSessionStats.values()) {
      present += stats.present;
      absent += stats.absent;
      total += stats.total;
    }
    return { present, absent, total };
  }, [allSessionStats]);

  const absentByDate = useMemo(() => {
    const byDate = new Map<string, Set<string>>();
    for (const session of sessions) {
      const absentSet = absentBySession.get(session.id) ?? new Set<string>();
      if (!byDate.has(session.date)) {
        byDate.set(session.date, new Set());
      }
      const dateSet = byDate.get(session.date);
      absentSet.forEach((studentId) => dateSet?.add(studentId));
    }
    return byDate;
  }, [sessions, absentBySession]);

  const totalWeightedBySession = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of sessions) {
      map.set(session.id, session.period_count || 1);
    }
    return map;
  }, [sessions]);

  const summaryByStudent = useMemo(() => {
    const sessionIds = sessions.map((s) => s.id);
    const totalWeighted = sessionIds.reduce(
      (sum, id) => sum + (totalWeightedBySession.get(id) ?? 1),
      0
    );
    return students.map((student) => {
      let absentWeighted = 0;
      for (const session of sessions) {
        const absentSet = absentBySession.get(session.id);
        if (absentSet && absentSet.has(student.id)) {
          absentWeighted += totalWeightedBySession.get(session.id) ?? 1;
        }
      }
      const presentWeighted = Math.max(totalWeighted - absentWeighted, 0);
      const percentage =
        totalWeighted === 0 ? 0 : Math.round((presentWeighted / totalWeighted) * 100);
      return {
        student,
        totalWeighted,
        absentWeighted,
        presentWeighted,
        percentage
      };
    });
  }, [students, sessions, absentBySession, totalWeightedBySession]);

  const allTimeSummaryByStudent = useMemo(() => {
    const totalWeighted = allSessions.reduce(
      (sum, session) => sum + (session.period_count || 1),
      0
    );
    return students.map((student) => {
      let absentWeighted = 0;
      for (const session of allSessions) {
        const absentSet = allAbsentBySession.get(session.id);
        if (absentSet && absentSet.has(student.id)) {
          absentWeighted += allSessionWeights.get(session.id) ?? 1;
        }
      }
      const presentWeighted = Math.max(totalWeighted - absentWeighted, 0);
      const percentage =
        totalWeighted === 0 ? 0 : Math.round((presentWeighted / totalWeighted) * 100);
      return {
        student,
        totalWeighted,
        absentWeighted,
        presentWeighted,
        percentage
      };
    });
  }, [students, allSessions, allAbsentBySession, allSessionWeights]);

  const maxAbsentees = useMemo(() => {
    if (students.length === 0 || allSessions.length === 0) return [];
    const absentCount = new Map<string, number>();
    for (const record of allRecords) {
      if (record.status === "A") {
        const weight = allSessionWeights.get(record.session_id) ?? 1;
        absentCount.set(record.student_id, (absentCount.get(record.student_id) ?? 0) + weight);
      }
    }
    let maxAbsent = 0;
    for (const value of absentCount.values()) {
      if (value > maxAbsent) maxAbsent = value;
    }
    if (maxAbsent === 0) return [];
    return students
      .map((student) => ({
        student,
        absentWeighted: absentCount.get(student.id) ?? 0
      }))
      .filter((entry) => entry.absentWeighted === maxAbsent)
      .sort((a, b) => {
        const rollA = a.student.roll_no ?? "";
        const rollB = b.student.roll_no ?? "";
        return rollA.localeCompare(rollB);
      });
  }, [students, allRecords, allSessionWeights, allSessions]);

  function csvEscape(value: string | number | null | undefined) {
    const raw = value === null || value === undefined ? "" : String(value);
    if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  function handleExportSummary() {
    if (summaryByStudent.length === 0) return;
    const header = ["roll_no", "name", "present_count", "absent_count", "total_weighted", "percentage"];
    const rows = summaryByStudent.map((entry) => [
      entry.student.roll_no ?? "",
      entry.student.name,
      entry.presentWeighted,
      entry.absentWeighted,
      entry.totalWeighted,
      entry.percentage
    ]);
    const csv =
      header.join(",") +
      "\n" +
      rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics_summary_${selectedClassId}_${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const consecutiveAbsentees = useMemo(() => {
    if (!selectedClassId) return [];
    const sortedSessions = [...sessions].sort((a, b) => {
      if (a.date === b.date) {
        return a.time_slot.localeCompare(b.time_slot);
      }
      return a.date.localeCompare(b.date);
    });
    const lastSessions = sortedSessions.slice(-6).reverse();
    const result: { student: StudentRecord; streak: number }[] = [];
    for (const student of students) {
      let streak = 0;
      for (const session of lastSessions) {
        const absentSet = absentBySession.get(session.id);
        if (absentSet && absentSet.has(student.id)) {
          streak += 1;
        } else {
          break;
        }
      }
      if (streak >= 2) {
        result.push({ student, streak });
      }
    }
    return result.sort((a, b) => b.streak - a.streak);
  }, [students, sessions, absentBySession, selectedClassId]);

  return (
    <RequireAuth>
      <AppShell title="Analytics">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-600">
              Class
              <select
                className="mt-1 h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
              >
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.subject_name} · {item.section}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Month
              <input
                type="month"
                className="mt-1 h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </label>
            <Button type="button" variant="secondary" onClick={() => setMonth(new Date().toISOString().slice(0, 7))}>
              This month
            </Button>
            <Button type="button" variant="secondary" onClick={handleExportSummary}>
              Export summary CSV
            </Button>
            {status ? <span className="text-sm text-rose-600">{status}</span> : null}
          </CardContent>
        </Card>

        {loading ? <p className="text-sm text-slate-500">Loading analytics...</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Monthly Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-sm text-slate-500">No students yet for this class.</p>
            ) : sessionDates.length === 0 ? (
              <p className="text-sm text-slate-500">No attendance sessions for this month.</p>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2 pr-4">Student</th>
                      {sessionDates.map((date) => (
                        <th key={date} className="py-2 pr-3">
                          {date.slice(8, 10)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id} className="border-t">
                        <td className="py-2 pr-4 font-medium text-ink">{student.name}</td>
                        {sessionDates.map((date) => {
                          const absentSet = absentByDate.get(date);
                          const isAbsent = absentSet?.has(student.id);
                          return (
                            <td key={`${student.id}-${date}`} className="py-2 pr-3">
                              <span
                                className={
                                  isAbsent
                                    ? "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-600"
                                    : "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"
                                }
                              >
                                {isAbsent ? "A" : "P"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t bg-slate-50 text-slate-600">
                      <td className="py-2 pr-4 font-semibold">Absent total</td>
                      {sessionDates.map((date) => (
                        <td key={`total-${date}`} className="py-2 pr-3 font-semibold">
                          {absentByDate.get(date)?.size ?? 0}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Student Summary (Weighted)</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryByStudent.length === 0 ? (
              <p className="text-sm text-slate-500">No students to summarize.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {summaryByStudent.map((entry) => (
                  <div
                    key={entry.student.id}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">{entry.student.name}</p>
                        <p className="text-xs text-slate-500">Roll {entry.student.roll_no ?? "—"}</p>
                      </div>
                      <span
                        className={
                          entry.percentage >= 75
                            ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                            : entry.percentage >= 60
                              ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                              : "rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600"
                        }
                      >
                        {entry.percentage}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <span>Present: {entry.presentWeighted}</span>
                      <span>Absent: {entry.absentWeighted}</span>
                      <span>Total: {entry.totalWeighted}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {allTimeLoading ? <p className="text-sm text-slate-500">Loading all-time attendance...</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>All-Time Student Summary (Weighted)</CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-sm text-slate-500">No students to summarize yet.</p>
            ) : allSessions.length === 0 ? (
              <p className="text-sm text-slate-500">No attendance sessions yet for this class.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {allTimeSummaryByStudent.map((entry) => (
                  <div
                    key={`all-time-${entry.student.id}`}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">{entry.student.name}</p>
                        <p className="text-xs text-slate-500">Roll {entry.student.roll_no ?? "â€”"}</p>
                      </div>
                      <span
                        className={
                          entry.percentage >= 75
                            ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                            : entry.percentage >= 60
                              ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                              : "rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600"
                        }
                      >
                        {entry.percentage}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <span>Present: {entry.presentWeighted}</span>
                      <span>Absent: {entry.absentWeighted}</span>
                      <span>Total: {entry.totalWeighted}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All Sessions (All time)</CardTitle>
          </CardHeader>
          <CardContent>
            {allSessionsSorted.length === 0 ? (
              <p className="text-sm text-slate-500">No attendance sessions yet for this class.</p>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Time slot</th>
                      <th className="py-2 pr-4">Periods</th>
                      <th className="py-2 pr-4">Present</th>
                      <th className="py-2 pr-4">Absent</th>
                      <th className="py-2 pr-4">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allSessionsSorted.map((session) => {
                      const stats = allSessionStats.get(session.id) ?? { present: 0, absent: 0, total: 0 };
                      return (
                        <tr key={`all-${session.id}`} className="border-t">
                          <td className="py-2 pr-4 font-medium text-ink">{session.date}</td>
                          <td className="py-2 pr-4 text-slate-500">{session.time_slot}</td>
                          <td className="py-2 pr-4 text-slate-500">{session.period_count}</td>
                          <td className="py-2 pr-4 text-emerald-700">{stats.present}</td>
                          <td className="py-2 pr-4 text-rose-600">{stats.absent}</td>
                          <td className="py-2 pr-4">{stats.total}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t bg-slate-50 text-slate-600">
                      <td className="py-2 pr-4 font-semibold" colSpan={3}>
                        Totals
                      </td>
                      <td className="py-2 pr-4 font-semibold">{allTotals.present}</td>
                      <td className="py-2 pr-4 font-semibold">{allTotals.absent}</td>
                      <td className="py-2 pr-4 font-semibold">{allTotals.total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Absentees (All time)</CardTitle>
          </CardHeader>
          <CardContent>
            {maxAbsentees.length === 0 ? (
              <p className="text-sm text-slate-500">No absences recorded yet.</p>
            ) : (
              <div className="grid gap-2">
                {maxAbsentees.map((entry) => (
                  <div
                    key={`max-absent-${entry.student.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{entry.student.name}</p>
                      <p className="text-xs text-slate-500">Roll {entry.student.roll_no ?? "â€”"}</p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600">
                      {entry.absentWeighted} periods absent
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consecutive Absentees (latest sessions)</CardTitle>
          </CardHeader>
          <CardContent>
            {consecutiveAbsentees.length === 0 ? (
              <p className="text-sm text-slate-500">No consecutive absentees detected.</p>
            ) : (
              <div className="grid gap-2">
                {consecutiveAbsentees.map((entry) => (
                  <div key={entry.student.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">{entry.student.name}</p>
                      <p className="text-xs text-slate-500">Roll {entry.student.roll_no ?? "—"}</p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600">
                      {entry.streak} sessions absent
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </AppShell>
    </RequireAuth>
  );
}
