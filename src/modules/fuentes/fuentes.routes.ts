import { Router } from 'express';
import type { Request } from 'express';
import { ROLES_CONSULTA, ROLES_GESTION } from '../../config/roles';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRol } from '../../middleware/requireRol';
import { validarBody, validarDatos } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import {
    cambiarEstadoSchema,
    crearFuenteSchema,
    editarFuenteSchema,
    idParamSchema,
    listarFuentesQuerySchema,
} from './fuentes.schemas';
import type { CambiarEstadoInput, CrearFuenteInput, EditarFuenteInput } from './fuentes.schemas';
import * as fuentes from './fuentes.service';
import type { Actor } from './fuentes.service';

export const fuentesRouter = Router();

// Todas las rutas de este modulo exigen sesion iniciada
fuentesRouter.use(requireAuth);

// El actor sale de la sesion, nunca del cuerpo de la peticion
function actorDe(req: Request): Actor {
    if (!req.user) throw new AppError('No has iniciado sesion', 401, 'NO_AUTENTICADO');
    return { id: req.user.id, ip: req.ip };
}

fuentesRouter.get('/', requireRol(...ROLES_CONSULTA), async (req, res) => {
    const { estado } = validarDatos(listarFuentesQuerySchema, req.query);
    res.json({ ok: true, data: { fuentes: await fuentes.listarFuentes(estado) } });
});

fuentesRouter.get('/:id', requireRol(...ROLES_CONSULTA), async (req, res) => {
    const { id } = validarDatos(idParamSchema, req.params);
    res.json({ ok: true, data: { fuente: await fuentes.obtenerFuente(id) } });
});

fuentesRouter.post('/', requireRol(...ROLES_GESTION), validarBody(crearFuenteSchema), async (req, res) => {
    const fuente = await fuentes.crearFuente(req.body as CrearFuenteInput, actorDe(req));
    res.status(201).json({ ok: true, data: { fuente } });
});

fuentesRouter.put('/:id', requireRol(...ROLES_GESTION), validarBody(editarFuenteSchema), async (req, res) => {
    const { id } = validarDatos(idParamSchema, req.params);
    const fuente = await fuentes.editarFuente(id, req.body as EditarFuenteInput, actorDe(req));
    res.json({ ok: true, data: { fuente } });
});

fuentesRouter.patch('/:id/estado', requireRol(...ROLES_GESTION), validarBody(cambiarEstadoSchema), async (req, res) => {
    const { id } = validarDatos(idParamSchema, req.params);
    const { estado } = req.body as CambiarEstadoInput;
    const fuente = await fuentes.cambiarEstadoFuente(id, estado, actorDe(req));
    res.json({ ok: true, data: { fuente } });
});