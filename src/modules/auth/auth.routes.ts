import { Router } from 'express';
import type { CookieOptions } from 'express';
import { env } from '../../config/env';
import { loginLimiter } from '../../middleware/rateLimit';
import { COOKIE_NAME, requireAuth } from '../../middleware/requireAuth';
import { validarBody } from '../../middleware/validate';
import { firmarSesion } from '../../utils/token';
import { loginSchema } from './auth.schemas';
import type { LoginInput } from './auth.schemas';
import * as authService from './auth.service';

export const authRouter = Router();

// httpOnly: JavaScript no puede leer la cookie (protege contra robo por XSS)
// sameSite=lax: el navegador no la envia en peticiones POST desde otros sitios (protege contra CSRF)
const cookieBase: CookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
};

authRouter.post('/login', loginLimiter, validarBody(loginSchema), async (req, res) => {
    const { email, password } = req.body as LoginInput;
    const usuario = await authService.login(email, password);

    res.cookie(COOKIE_NAME, firmarSesion(usuario.id), {
        ...cookieBase,
        maxAge: env.SESSION_MINUTES * 60 * 1000,
    });
    res.json({ ok: true, data: { usuario } });
});

authRouter.get('/me', requireAuth, (req, res) => {
    res.json({ ok: true, data: { usuario: req.user } });
});

authRouter.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieBase);
    res.json({ ok: true });
});