import { z } from 'zod';
import { passwordNueva, reenviarSchema, verificarSchema } from './registro.schemas';

// Misma forma que "reenviar verificacion": solo el correo
export const recuperarSchema = reenviarSchema;

// Solo el token (sirve para comprobar que el enlace sigue vigente antes de pedir la contrasena nueva)
export const tokenRecuperacionSchema = verificarSchema;

export const restablecerSchema = z.object({
    token: verificarSchema.shape.token,
    password: passwordNueva,
});

export type RecuperarInput = z.infer<typeof recuperarSchema>;
export type TokenRecuperacionInput = z.infer<typeof tokenRecuperacionSchema>;
export type RestablecerInput = z.infer<typeof restablecerSchema>;