import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const appointments = await prisma.appointment.findMany({
      include: { patient: true, doctor: true },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(appointments);
  } catch (err) {
    console.error("GET /api/appointments failed", err);
    return NextResponse.json(
      { error: "Failed to fetch appointments" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const { date, status, notes, patientId, doctorId } = body as {
    date?: string;
    status?: "pending" | "confirmed" | "done" | "cancelled";
    notes?: string | null;
    patientId?: string;
    doctorId?: string;
  };

  if (!date || !patientId || !doctorId) {
    return NextResponse.json(
      { error: "date, patientId, and doctorId are required" },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.appointment.create({
      data: {
        date: new Date(date),
        status: status ?? "pending",
        notes: notes ?? null,
        patientId,
        doctorId,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("POST /api/appointments failed", err);
    return NextResponse.json(
      { error: "Failed to create appointment" },
      { status: 500 },
    );
  }
}
