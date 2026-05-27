"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalAppointment } from "@/lib/db";
import { syncAll } from "@/lib/sync";

export type NewAppointmentInput = Omit<
  LocalAppointment,
  "id" | "status" | "createdAt" | "serverId"
>;

export function useAppointments() {
  const appointments = useLiveQuery(
    () => db.appointments.orderBy("date").toArray(),
    [],
    [] as LocalAppointment[],
  );

  const addAppointment = useCallback(
    async (data: NewAppointmentInput): Promise<LocalAppointment> => {
      const record: LocalAppointment = {
        id: crypto.randomUUID(),
        ...data,
        status: "pending",
        createdAt: new Date(),
      };

      await db.appointments.add(record);

      if (typeof window !== "undefined" && navigator.onLine) {
        void syncAll().catch((err) => {
          console.error("[useAppointments] background sync failed", err);
        });
      }

      return record;
    },
    [],
  );

  const deleteAppointment = useCallback(async (id: string): Promise<void> => {
    await db.appointments.delete(id);
  }, []);

  return { appointments, addAppointment, deleteAppointment };
}
