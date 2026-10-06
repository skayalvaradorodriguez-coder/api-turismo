import type { CookieOptions, Response } from 'express';
import { env } from '../config/env';
import { COOKIE_NAME } from '../middleware/requireAuth';
import { firmarSesion } from './token';

// httpOnly: JavaScript no puede leer la cookie (protege contra robo por XSS)
// sameSite=lax: el navegador no la envia en peticiones POST desde otros sitios (protege contra CSRF)
export const cookieBase: CookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
};

/** Abre la sesion del usuario: la misma cookie que crea el login con contrasena. */
export function abrirSesion(res: Response, usuarioId: number): void {
    res.cookie(COOKIE_NAME, firmarSesion(usuarioId), {
        ...cookieBase,
        maxAge: env.SESSION_MINUTES * 60 * 1000,
    });
}