import { Router } from 'express';
import type { Request } from 'express';
import { ROLES_CONSULTA, ROLES_GESTION } from '../../config/roles';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRol } from '../../middleware/requireRol';
import { validarBody, validarDatos } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import type { Actor } from '../fuentes/fuentes.service';
import { cargaParamSchema, ejecutarProcesamientoSchema, listarHallazgosQuerySchema, procesamientoParamSchema } from './procesamiento.schemas';
import type { EjecutarProcesamientoInput } from './procesamiento.schemas';
import * as procesamiento from './procesamiento.service';

export const procesamientoRouter = Router();

// Todas las rutas de este modulo exigen sesion iniciada
procesamientoRouter.use(requireAuth);

// El actor sale de la sesion, nunca del cuerpo de la peticion
function actorDe(req: Request): Actor {
    if (!req.user) throw new AppError('No has iniciado sesion', 401, 'NO_AUTENTICADO');
    return { id: req.user.id, ip: req.ip };
}

// ---------------------------------------------------------------
// Ejecutar: validar o procesar un archivo de la carga
// ---------------------------------------------------------------
procesamientoRouter.post('/:id/procesamientos', requireRol(...ROLES_GESTION), validarBody(ejecutarProcesamientoSchema), async (req, res) => {
    const { id } = validarDatos(cargaParamSchema, req.params);
    const resultado = await procesamiento.ejecutarProcesamiento(id, req.body as EjecutarProcesamientoInput, actorDe(req));
    res.status(201).json({ ok: true, data: resultado });
});

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
