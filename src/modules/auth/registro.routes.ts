import { Router } from 'express';
import { correoLimiter, registroLimiter, verificacionLimiter } from '../../middleware/rateLimit';
import { validarBody } from '../../middleware/validate';
import { reenviarSchema, registroSchema, verificarSchema } from './registro.schemas';
import type { ReenviarInput, RegistroInput, VerificarInput } from './registro.schemas';
import * as registro from './registro.service';

export const registroRouter = Router();

const MENSAJE_CORREO = 'Si el correo es valido, te enviamos un mensaje con las instrucciones.';

registroRouter.post('/registro', registroLimiter, validarBody(registroSchema), async (req, res) => {
    await registro.registrar(req.body as RegistroInput);
    res.status(201).json({ ok: true, data: { mensaje: MENSAJE_CORREO } });
});

// POST (y no GET) a proposito: los antivirus y lectores de correo abren los enlaces GET sin querer
// y gastarian el token antes de que la persona haga clic.
registroRouter.post('/verificar-email', verificacionLimiter, validarBody(verificarSchema), async (req, res) => {
    await registro.verificarEmail((req.body as VerificarInput).token);
    res.json({ ok: true });
});

registroRouter.post('/reenviar-verificacion', correoLimiter, validarBody(reenviarSchema), async (req, res) => {
    await registro.reenviarVerificacion((req.body as ReenviarInput).email);
    res.json({ ok: true, data: { mensaje: MENSAJE_CORREO } });
});