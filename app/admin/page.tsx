import { redirect } from "next/navigation";
import { auth } from "@/auth";

// /admin → first tab available to the role. STAFF/ADMIN land on Orders; a
// DOCTOR on Patients. (proxy.ts currently lets only STAFF/ADMIN reach bare
// /admin; the account-menu link points a DOCTOR straight at /admin/patients.)
export default async function AdminIndex() {
  const session = await auth();
  redirect(
    session?.user?.role === "DOCTOR" ? "/admin/patients" : "/admin/orders",
  );
}
