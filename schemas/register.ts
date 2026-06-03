import { z } from "zod";
import { normalizePhone } from "@/lib/normalizePhone";

/**
 * Used by:
 *   - POST /api/register (server-side validation)
 *   - Sign-up form in LoginModal (client-side validation via rhf+zod)
 *
 * Patient.name is NOT NULL → name is required (min 2). Phone is normalised to
 * the canonical +380XXXXXXXXX form (transform) BEFORE the strict UA check, so
 * "050 123 45 67", "0501234567" і "+380501234567" сприймаються однаково.
 * Той самий normalizePhone викликається і в /api/register. Password: min 8,
 * at least one letter and one digit — the server re-validates so the client
 * check is purely UX.
 */
export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Імʼя занадто коротке")
    .max(80, "Імʼя занадто довге"),
  email: z.string().min(1, "Вкажіть email").email("Невірний формат email"),
  phone: z
    .string()
    .transform((value) => normalizePhone(value))
    .refine((value) => /^\+380\d{9}$/.test(value), "Формат: +380XXXXXXXXX"),
  password: z
    .string()
    .min(8, "Мінімум 8 символів")
    .regex(/[A-Za-z]/, "Має містити літеру")
    .regex(/\d/, "Має містити цифру"),
});

export type RegisterValues = z.infer<typeof registerSchema>;
