import { z } from 'zod';

export const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(255, 'Use 255 characters or fewer')
    .refine((v) => !/[\\/]/.test(v), 'Names cannot contain / or \\')
    .refine((v) => v !== '.' && v !== '..', 'That name is not allowed'),
});
export type NameForm = z.infer<typeof nameSchema>;
