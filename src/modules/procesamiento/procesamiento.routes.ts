import type { Request } from 'express';
import { Router } from 'express';
import { ROLES_CONSULTA, ROLES_GESTION } from '../../config/roles';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRol } from '../../middleware/requireRol';
import { validarDatos } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import type { Actor } from '../fuentes/fuentes.service';
import {
    cargaParamSchema,
    listarHallazgosQuerySchema,
    listarRegistrosQuerySchema,
    procesamientoParamSchema,
} from './procesamiento.schemas';
import * as procesamiento from './procesamiento.service';

export const procesamientoRouter = Router();

// Todas las rutas de este modulo exigen sesion iniciada
procesamientoRouter.use(requireAuth);

// El actor sale de la sesion, nunca del cuerpo de la peticion
function actorDe(req: Request): Actor {
    if (!req.user) throw new AppError('No has iniciado sesion', 401, 'NO_AUTENTICADO');
    return { id: req.user.id, ip: req.ip };
}

const esGestion = (rol: string): boolean => (ROLES_GESTION as readonly string[]).includes(rol);

// ---------------------------------------------------------------
// Operaciones (solo roles de gestion). No reciben cuerpo: todo sale de la carga guardada.
// ---------------------------------------------------------------
procesamientoRouter.post('/:id/validar', requireRol(...ROLES_GESTION), async (req, res) => {
    const { id } = validarDatos(cargaParamSchema, req.params);
    res.json({ ok: true, data: await procesamiento.validarCarga(id, actorDe(req)) });
});

procesamientoRouter.post('/:id/procesar', requireRol(...ROLES_GESTION), async (req, res) => {
    const { id } = validarDatos(cargaParamSchema, req.params);
    res.json({ ok: true, data: await procesamiento.procesarCarga(id, actorDe(req)) });
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

procesamientoRouter.get('/:id/registros', requireRol(...ROLES_CONSULTA), async (req, res) => {
    const { id } = validarDatos(cargaParamSchema, req.params);
    const { sensibles, ...filtro } = validarDatos(listarRegistrosQuerySchema, req.query);

    // RUC y propietario: solo los roles de gestion pueden pedirlos
    if (sensibles && !esGestion(req.user?.rol ?? '')) {
        throw new AppError('No tienes permiso para ver datos sensibles', 403, 'PERMISO_INSUFICIENTE');
    }

    const resultado = await procesamiento.obtenerRegistros(id, filtro, sensibles, actorDe(req));
    res.json({ ok: true, data: { ...resultado, pagina: filtro.pagina, limite: filtro.limite, sensibles } });
});
