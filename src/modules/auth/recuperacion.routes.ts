import { Router } from 'express';
import { correoLimiter, verificacionLimiter } from '../../middleware/rateLimit';
import { validarBody } from '../../middleware/validate';
import { recuperarSchema, restablecerSchema, tokenRecuperacionSchema } from './recuperacion.schemas';
import type { RecuperarInput, RestablecerInput, TokenRecuperacionInput } from './recuperacion.schemas';
import * as recuperacion from './recuperacion.service';

export const recuperacionRouter = Router();

recuperacionRouter.post('/recuperar', correoLimiter, validarBody(recuperarSchema), async (req, res) => {
    await recuperacion.solicitarRecuperacion((req.body as RecuperarInput).email);
    res.json({ ok: true, data: { mensaje: 'Si el correo esta registrado, te enviamos un mensaje con las instrucciones.' } });
});

recuperacionRouter.post('/validar-recuperacion', verificacionLimiter, validarBody(tokenRecuperacionSchema), async (req, res) => {
    await recuperacion.comprobarTokenRecuperacion((req.body as TokenRecuperacionInput).token);
    res.json({ ok: true });
});

recuperacionRouter.post('/restablecer', verificacionLimiter, validarBody(restablecerSchema), async (req, res) => {
    await recuperacion.restablecerPassword(req.body as RestablecerInput);
    res.json({ ok: true });
});