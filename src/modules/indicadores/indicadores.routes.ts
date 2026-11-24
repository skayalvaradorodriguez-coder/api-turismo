import { Router } from 'express';
import { ROLES_CONSULTA } from '../../config/roles';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRol } from '../../middleware/requireRol';
import { validarDatos } from '../../middleware/validate';
import { cargaParamSchema } from '../procesamiento/procesamiento.schemas';
import * as indicadores from './indicadores.service';

export const indicadoresRouter = Router();

indicadoresRouter.use(requireAuth);

// Indicadores calculados con los registros procesados de una carga (solo lectura)
indicadoresRouter.get('/:id/indicadores', requireRol(...ROLES_CONSULTA), async (req, res) => {
    const { id } = validarDatos(cargaParamSchema, req.params);
    res.json({ ok: true, data: await indicadores.indicadoresDeCarga(id) });
});
