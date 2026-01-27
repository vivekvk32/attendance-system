export type ClassRecord = {
  id: string;
  owner_id: string;
  subject_name: string;
  semester: string;
  section: string;
  academic_year: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StudentRecord = {
  id: string;
  owner_id: string;
  class_id: string;
  roll_no: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type OutboxOp = {
  id?: number;
  table: "classes" | "students" | "attendance_sessions" | "attendance_records";
  action: "insert" | "update" | "delete";
  record_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type MetaRecord = {
  key: string;
  value: string;
};
