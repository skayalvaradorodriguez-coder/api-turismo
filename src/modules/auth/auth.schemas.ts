import { z } from 'zod';

export const loginSchema = z.object({
    email: z
        .string({ error: 'Ingresa tu correo' })
        .trim()
        .toLowerCase()
        .pipe(z.email({ error: 'Ingresa un correo valido' }).max(190, { error: 'Correo demasiado largo' })),
    // En el login NO se exige formato de contrasena (eso es al crearla); solo un maximo razonable
    password: z
        .string({ error: 'Ingresa tu contrasena' })
        .min(1, { error: 'Ingresa tu contrasena' })
        .max(128, { error: 'Contrasena demasiado larga' }),
});

export type LoginInput = z.infer<typeof loginSchema>;