import Dexie, { type Table } from "dexie";

export interface LocalAppointment {
  id: string;
  patientName: string;
  doctorName: string;
  date: string;
  time: string;
  notes: string;
  status: "pending" | "synced" | "failed";
  serverId?: string;
  createdAt: Date;
}

export interface LocalPatient {
  id: string;
  name: string;
  email: string;
  phone: string;
  synced: boolean;
}

export class ClinicDatabase extends Dexie {
  appointments!: Table<LocalAppointment, string>;
  patients!: Table<LocalPatient, string>;

  constructor() {
    super("ClinicDatabase");
    this.version(1).stores({
      appointments: "id, status, date, serverId",
      patients: "id",
    });
  }
}

export const db = new ClinicDatabase();
