"use client";

import { db } from "./db";
import { supabase } from "./supabaseClient";
import type { ClassRecord, StudentRecord, OutboxOp } from "./types";

const META_LAST_SYNC = "last_sync";
const META_DEVICE_ID = "device_id";

function nowIso() {
  return new Date().toISOString();
}

async function ensureMeta() {
  if (!db) return;
  const existing = await db.meta.get(META_DEVICE_ID);
  if (!existing) {
    const deviceId = crypto.randomUUID();
    await db.meta.bulkPut([
      { key: META_DEVICE_ID, value: deviceId },
      { key: META_LAST_SYNC, value: new Date(0).toISOString() }
    ]);
  }
}

export async function getLastSync() {
  if (!db) return null;
  const record = await db.meta.get(META_LAST_SYNC);
  return record?.value ?? null;
}

export async function getPendingCount() {
  if (!db) return 0;
  return db.outbox.count();
}

export async function queueOutbox(op: OutboxOp) {
  if (!db) return;
  await db.outbox.add(op);
}

async function pushOutbox(userId: string) {
  if (!db) return;
  const items = await db.outbox.orderBy("created_at").toArray();
  for (const item of items) {
    try {
      if (item.table === "classes" || item.table === "students") {
        if (item.action === "delete") {
          const deletedAt = (item.payload.deleted_at as string) ?? nowIso();
          const { error } = await supabase
            .from(item.table)
            .update({ deleted_at: deletedAt })
            .eq("id", item.record_id);
          if (error) throw error;
        } else {
          const payload = {
            ...item.payload,
            owner_id: userId
          };
          const { error } = await supabase.from(item.table).upsert(payload, { onConflict: "id" });
          if (error) throw error;
        }
      }
      await db.outbox.delete(item.id as number);
    } catch (err) {
      console.warn("Sync push failed", err);
      break;
    }
  }
}

function isRemoteNewer(remoteUpdatedAt: string, localUpdatedAt?: string | null) {
  if (!localUpdatedAt) return true;
  return new Date(remoteUpdatedAt).getTime() >= new Date(localUpdatedAt).getTime();
}

async function applyRemoteClasses(records: ClassRecord[]) {
  if (!db) return;
  for (const record of records) {
    const local = await db.classes.get(record.id);
    if (isRemoteNewer(record.updated_at, local?.updated_at ?? null)) {
      await db.classes.put(record);
    }
  }
}

async function applyRemoteStudents(records: StudentRecord[]) {
  if (!db) return;
  for (const record of records) {
    const local = await db.students.get(record.id);
    if (isRemoteNewer(record.updated_at, local?.updated_at ?? null)) {
      await db.students.put(record);
    }
  }
}

async function pullUpdates(lastSyncIso: string) {
  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("*")
    .gt("updated_at", lastSyncIso);
  if (classesError) throw classesError;
  await applyRemoteClasses((classes ?? []) as ClassRecord[]);

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("*")
    .gt("updated_at", lastSyncIso);
  if (studentsError) throw studentsError;
  await applyRemoteStudents((students ?? []) as StudentRecord[]);
}

export async function syncNow() {
  if (!db) return;
  await ensureMeta();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return;
  const userId = session.user.id;

  const lastSync = (await getLastSync()) ?? new Date(0).toISOString();
  await pushOutbox(userId);
  await pullUpdates(lastSync);

  await db.meta.put({ key: META_LAST_SYNC, value: nowIso() });
}
