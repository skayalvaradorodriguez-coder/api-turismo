import { Router } from 'express';
import { ROLES_CONSULTA } from '../../config/roles';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRol } from '../../middleware/requireRol';
import { validarDatos } from '../../middleware/validate';
import { cargaParamSchema, listarHallazgosQuerySchema, procesamientoParamSchema } from './procesamiento.schemas';
import * as procesamiento from './procesamiento.service';

export const procesamientoRouter = Router();

// Todas las rutas de este modulo exigen sesion iniciada
procesamientoRouter.use(requireAuth);

// ---------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------
procesamientoRouter.get('/:id/procesamientos', requireRol(...ROLES_CONSULTA), async (req, res) => {
    const { id } = validarDatos(cargaParamSchema, req.params);
    res.json({ ok: true, data: { procesamientos: await procesamiento.listarProcesamientosDeCarga(id) } });
});

procesamientoRouter.get('/:id/procesamientos/:procesamientoId/hallazgos', requireRol(...ROLES_CONSULTA), async (req, res) => {
    const { id, procesamientoId } = validarDatos(procesamientoParamSchema, req.params);
    const filtro = validarDatos(listarHallazgosQuerySchema, req.query);
    const resultado = await procesamiento.obtenerHallazgos(id, procesamientoId, filtro);
    res.json({ ok: true, data: { ...resultado, pagina: filtro.pagina, limite: filtro.limite } });
});
