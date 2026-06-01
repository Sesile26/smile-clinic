import { z } from "zod";

export const loginSchema = z
  .object({
    mode: z.enum(["patient", "staff"]),
    staffId: z.string().optional(),
    email: z
      .string()
      .min(1, "Вкажіть email")
      .email("Невірний формат email"),
    password: z.string().min(1, "Введіть пароль").min(6, "Мінімум 6 символів"),
    remember: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "staff" && (!val.staffId || val.staffId.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["staffId"],
        message: "Вкажіть ID співробітника",
      });
    }
  });

export type LoginValues = z.infer<typeof loginSchema>;
