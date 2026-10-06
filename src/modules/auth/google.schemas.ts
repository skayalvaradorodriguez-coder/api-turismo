import { z } from 'zod';

export const googleSchema = z.object({
    // JWT firmado por Google (el "ID token"); mide cerca de 1 KB
    credential: z
        .string({ error: 'Falta la credencial de Google' })
        .min(20, { error: 'Credencial invalida' })
        .max(4096, { error: 'Credencial invalida' }),
});

export type GoogleInput = z.infer<typeof googleSchema>;