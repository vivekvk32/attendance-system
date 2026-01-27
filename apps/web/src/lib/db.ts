"use client";

import Dexie, { type Table } from "dexie";
import type { ClassRecord, StudentRecord, OutboxOp, MetaRecord } from "./types";

export class AttendanceDb extends Dexie {
  classes!: Table<ClassRecord, string>;
  students!: Table<StudentRecord, string>;
  attendance_sessions!: Table<Record<string, unknown>, string>;
  attendance_records!: Table<Record<string, unknown>, string>;
  outbox!: Table<OutboxOp, number>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super("attendance_db");
    this.version(1).stores({
      classes: "id, owner_id, updated_at, deleted_at",
      students: "id, owner_id, class_id, updated_at, deleted_at",
      attendance_sessions: "id, owner_id, class_id, date, updated_at, deleted_at",
      attendance_records: "id, owner_id, session_id, student_id, updated_at, deleted_at",
      outbox: "++id, table, action, record_id, created_at",
      meta: "key"
    });
  }
}

export const db = typeof window === "undefined" ? null : new AttendanceDb();
