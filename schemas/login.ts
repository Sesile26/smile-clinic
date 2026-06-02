import { z } from "zod";

/**
 * Used by:
 *   - the Credentials provider in auth.ts (server-side validation in authorize)
 *   - the Sign-in form in LoginModal (client-side validation via rhf+zod)
 *
 * Keep generic — the server's generic "invalid email or password" error path
 * relies on returning null from authorize when this parse fails.
 */
export const loginSchema = z.object({
  email: z.string().min(1, "Вкажіть email").email("Невірний формат email"),
  password: z.string().min(1, "Введіть пароль"),
});

export type LoginValues = z.infer<typeof loginSchema>;
