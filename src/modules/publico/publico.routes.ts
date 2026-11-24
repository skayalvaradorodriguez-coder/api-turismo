import { Router } from 'express';
import { publicoLimiter } from '../../middleware/rateLimit';
import { validarDatos } from '../../middleware/validate';
import { cargaParamSchema } from '../procesamiento/procesamiento.schemas';
import * as publico from './publico.service';

export const publicoRouter = Router();

// Sin sesion, pero con limite de peticiones por IP. Solo lectura.
publicoRouter.use(publicoLimiter);

publicoRouter.get('/cargas', async (_req, res) => {
    res.json({ ok: true, data: { cargas: await publico.listarCargasPublicadas() } });
});

publicoRouter.get('/cargas/:id/indicadores', async (req, res) => {
    const { id } = validarDatos(cargaParamSchema, req.params);
    res.json({ ok: true, data: await publico.indicadoresPublicados(id) });
});
