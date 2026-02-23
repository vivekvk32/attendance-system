"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import type { StudentRecord } from "@/lib/types";

type AttendanceSession = {
  id: string;
  period_count: number;
  date: string;
  time_slot: string;
};

type AttendanceRecord = {
  session_id: string;
  student_id: string;
  status: "P" | "A";
};

type StudentOverallSummary = {
  student: StudentRecord;
  totalWeighted: number;
  absentWeighted: number;
  presentWeighted: number;
  presentPercentage: number;
  absentPercentage: number;
  belowThreshold: boolean;
  bySessionStatus: ("P" | "A")[];
};

export default function ReportsPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const { session } = useAuth();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setStatus(null);
      const { data: studentRows, error: studentsError } = await supabase
        .from("students")
        .select("*")
        .eq("class_id", classId)
        .is("deleted_at", null)
        .order("roll_no", { ascending: true });
      if (studentsError) {
        setStatus(studentsError.message);
        return;
      }
      setStudents((studentRows ?? []) as StudentRecord[]);

      const { data: sessionRows, error: sessionError } = await supabase
        .from("attendance_sessions")
        .select("id,period_count,date,time_slot")
        .eq("class_id", classId)
        .is("deleted_at", null)
        .order("date", { ascending: false });
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
      if (!selectedSessionId) {
        setSelectedSessionId(sessionList[0].id);
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
    loadData().finally(() => setLoading(false));
  }, [classId]);

  useEffect(() => {
    if (sessions.length > 0 && !sessions.find((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    async function loadAttendance(sessionId: string) {
      if (!sessionId) return;
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
    loadAttendance(selectedSessionId);
  }, [selectedSessionId]);

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

  const totalWeightedBySession = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of sessions) {
      map.set(session.id, session.period_count || 1);
    }
    return map;
  }, [sessions]);

  const summaryByStudent = useMemo(() => {
    const totalWeighted = sessions.reduce(
      (sum, session) => sum + (totalWeightedBySession.get(session.id) ?? 1),
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
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (a.date === b.date) {
          return a.time_slot.localeCompare(b.time_slot);
        }
        return a.date.localeCompare(b.date);
      }),
    [sessions]
  );

  const overallReportRows = useMemo<StudentOverallSummary[]>(() => {
    const totalWeighted = sortedSessions.reduce(
      (sum, session) => sum + (totalWeightedBySession.get(session.id) ?? 1),
      0
    );
    return students.map((student) => {
      let absentWeighted = 0;
      const bySessionStatus: ("P" | "A")[] = [];
      for (const session of sortedSessions) {
        const absentSet = absentBySession.get(session.id);
        const isAbsent = Boolean(absentSet && absentSet.has(student.id));
        if (isAbsent) {
          absentWeighted += totalWeightedBySession.get(session.id) ?? 1;
        }
        bySessionStatus.push(isAbsent ? "A" : "P");
      }
      const presentWeighted = Math.max(totalWeighted - absentWeighted, 0);
      const presentPercentage =
        totalWeighted === 0 ? 0 : Number(((presentWeighted / totalWeighted) * 100).toFixed(2));
      const absentPercentage =
        totalWeighted === 0 ? 0 : Number(((absentWeighted / totalWeighted) * 100).toFixed(2));
      return {
        student,
        totalWeighted,
        absentWeighted,
        presentWeighted,
        presentPercentage,
        absentPercentage,
        belowThreshold: presentPercentage < 85,
        bySessionStatus
      };
    });
  }, [students, sortedSessions, absentBySession, totalWeightedBySession]);

  function escapeHtml(value: string | number | null | undefined) {
    const raw = value === null || value === undefined ? "" : String(value);
    return raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sessionHeaderLabel(session: AttendanceSession) {
    const periods = session.period_count || 1;
    return periods > 1
      ? `${session.date} ${session.time_slot} (${periods})`
      : `${session.date} ${session.time_slot}`;
  }

  function handleGenerateOverallExcel() {
    setStatus(null);
    if (overallReportRows.length === 0) {
      setStatus("No attendance data available to export.");
      return;
    }
    const sessionHeaders = sortedSessions
      .map((session) => `<th>${escapeHtml(sessionHeaderLabel(session))}</th>`)
      .join("");
    const rows = overallReportRows
      .map((entry) => {
        const sessionCells = entry.bySessionStatus
          .map((statusValue) => `<td style="text-align:center">${statusValue}</td>`)
          .join("");
        const rowStyle = entry.belowThreshold
          ? ' style="background:#fee2e2;color:#991b1b;font-weight:600"'
          : "";
        return `<tr${rowStyle}>
  <td>${escapeHtml(entry.student.roll_no ?? "")}</td>
  <td>${escapeHtml(entry.student.name)}</td>
  ${sessionCells}
  <td style="text-align:center">${entry.totalWeighted}</td>
  <td style="text-align:center">${entry.presentWeighted}</td>
  <td style="text-align:center">${entry.absentWeighted}</td>
  <td style="text-align:center">${entry.presentPercentage.toFixed(2)}%</td>
  <td style="text-align:center">${entry.absentPercentage.toFixed(2)}%</td>
</tr>`;
      })
      .join("");
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; white-space: nowrap; }
    th { background: #e2e8f0; font-weight: 700; text-align: center; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>
        <th>Roll No</th>
        <th>Student Name</th>
        ${sessionHeaders}
        <th>Total Classes</th>
        <th>Present</th>
        <th>Absent</th>
        <th>Present %</th>
        <th>Absent %</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
    const blob = new Blob(["\ufeff", html], {
      type: "application/vnd.ms-excel;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `overall_attendance_${classId}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveEditedAttendance() {
    if (!selectedSessionId) return;
    const userId = session?.user.id;
    if (!userId) {
      setStatus("You are not signed in.");
      return;
    }
    const payload = students.map((student) => ({
      owner_id: userId,
      session_id: selectedSessionId,
      student_id: student.id,
      status: absentIds.has(student.id) ? "A" : "P"
    }));
    const { error } = await supabase.from("attendance_records").upsert(payload, {
      onConflict: "session_id,student_id"
    });
    if (error) {
      setStatus(error.message);
    } else {
      setStatus("Attendance updated.");
    }
  }

  return (
    <RequireAuth>
      <AppShell title="Class Reports">
        <Card>
          <CardHeader>
            <CardTitle>Edit Attendance</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-600">
                Session
                <select
                  className="mt-1 h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={selectedSessionId}
                  onChange={(event) => setSelectedSessionId(event.target.value)}
                >
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.date} {session.time_slot}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" onClick={handleSaveEditedAttendance} disabled={!selectedSessionId}>
                Save attendance
              </Button>
              {status ? <span className="text-sm text-slate-600">{status}</span> : null}
            </div>
            {students.length === 0 ? (
              <p className="text-sm text-slate-500">No students for this class.</p>
            ) : (
              <div className="grid gap-2">
                {students.map((student) => {
                  const absent = absentIds.has(student.id);
                  return (
                    <div
                      key={student.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">{student.name}</p>
                        <p className="text-xs text-slate-500">Roll {student.roll_no ?? "—"}</p>
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
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={handleGenerateOverallExcel}>
              Generate Overall Excel
            </Button>
            {status ? <span className="text-sm text-rose-600">{status}</span> : null}
          </CardContent>
        </Card>

        {loading ? <p className="text-sm text-slate-500">Loading report...</p> : null}
        <Card>
          <CardHeader>
            <CardTitle>Attendance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryByStudent.length === 0 ? (
              <p className="text-sm text-slate-500">No attendance data yet.</p>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2 pr-4">Student</th>
                      <th className="py-2 pr-4">Present</th>
                      <th className="py-2 pr-4">Absent</th>
                      <th className="py-2 pr-4">Total</th>
                      <th className="py-2 pr-4">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryByStudent.map((entry) => (
                      <tr key={entry.student.id} className="border-t">
                        <td className="py-2 pr-4 font-medium text-ink">
                          {entry.student.name}
                          <span className="ml-2 text-xs text-slate-400">
                            ({entry.student.roll_no ?? "—"})
                          </span>
                        </td>
                        <td className="py-2 pr-4">{entry.presentWeighted}</td>
                        <td className="py-2 pr-4">{entry.absentWeighted}</td>
                        <td className="py-2 pr-4">{entry.totalWeighted}</td>
                        <td className="py-2 pr-4">
                          <span
                            className={
                              entry.percentage >= 85
                                ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                                : "rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600"
                            }
                          >
                            {entry.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </AppShell>
    </RequireAuth>
  );
}
