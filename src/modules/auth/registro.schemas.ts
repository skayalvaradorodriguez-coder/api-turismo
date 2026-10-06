import { z } from 'zod';

const nombre = (etiqueta: string) =>
    z
        .string({ error: `Ingresa ${etiqueta}` })
        .trim()
        .min(2, { error: `${etiqueta}: minimo 2 caracteres` })
        .max(100, { error: `${etiqueta}: maximo 100 caracteres` })
        .regex(/^\p{L}[\p{L}\s'.-]*$/u, { error: `${etiqueta}: solo letras, espacios, apostrofes y guiones` });

const email = z
    .string({ error: 'Ingresa tu correo' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Ingresa un correo valido' }).max(190, { error: 'Correo demasiado largo' }));

// Misma politica que el script del super admin
export const passwordNueva = z
    .string({ error: 'Ingresa una contrasena' })
    .min(12, { error: 'La contrasena debe tener al menos 12 caracteres' })
    .max(128, { error: 'La contrasena es demasiado larga' })
    .regex(/[a-z]/, { error: 'Debe incluir una minuscula' })
    .regex(/[A-Z]/, { error: 'Debe incluir una mayuscula' })
    .regex(/[0-9]/, { error: 'Debe incluir un numero' });

export const registroSchema = z
    .object({
        nombres: nombre('nombres'),
        apellidos: nombre('apellidos'),
        email,
        password: passwordNueva,
    })
    .refine((d) => d.password.toLowerCase() !== d.email, {
        path: ['password'],
        error: 'La contrasena no puede ser igual al correo',
    });

export const verificarSchema = z.object({
    token: z
        .string({ error: 'Falta el token' })
        .min(20, { error: 'Token invalido' })
        .max(200, { error: 'Token invalido' })
        .regex(/^[A-Za-z0-9_-]+$/, { error: 'Token invalido' }),
});

export const reenviarSchema = z.object({ email });

export type RegistroInput = z.infer<typeof registroSchema>;
export type VerificarInput = z.infer<typeof verificarSchema>;
export type ReenviarInput = z.infer<typeof reenviarSchema>;