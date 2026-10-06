import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { googleLimiter } from '../../middleware/rateLimit';
import { validarBody } from '../../middleware/validate';
import { abrirSesion, cookieBase } from '../../utils/sessionCookie';
import { googleSchema } from './google.schemas';
import type { GoogleInput } from './google.schemas';
import { entrarConGoogle } from './google.service';
import { exigirGoogleConfigurado, verificarCredencial } from './google.verifier';

export const googleRouter = Router();

const NONCE_COOKIE = 'wt_gnonce';
const NONCE_MINUTOS = 30;

/**
 * Paso 1: antes de mostrar el boton de Google, la pagina pide un "nonce" (un numero aleatorio).
 * Se guarda en una cookie httpOnly y Google lo incluye dentro del token firmado: asi el token solo
 * sirve en el navegador que pidio ese nonce. Un token robado (de un registro, un log, etc.) no se
 * puede usar desde otro navegador, porque le falta la cookie.
 */
googleRouter.post('/google/nonce', googleLimiter, (_req, res) => {
    exigirGoogleConfigurado();
    const nonce = randomBytes(16).toString('base64url');
    res.cookie(NONCE_COOKIE, nonce, { ...cookieBase, maxAge: NONCE_MINUTOS * 60 * 1000 });
    res.json({ ok: true, data: { nonce } });
});

/** Paso 2: la pagina envia la credencial que le dio Google y la API abre la sesion. */
googleRouter.post('/google', googleLimiter, validarBody(googleSchema), async (req, res) => {
    const { credential } = req.body as GoogleInput;

    const nonce: unknown = req.cookies?.[NONCE_COOKIE];
    res.clearCookie(NONCE_COOKIE, cookieBase); // la cookie se borra tras cada intento: el siguiente pide un nonce nuevo

    const perfil = await verificarCredencial(credential, typeof nonce === 'string' ? nonce : undefined);
    const usuario = await entrarConGoogle(perfil);

    abrirSesion(res, usuario.id);
    res.json({ ok: true, data: { usuario } });
});