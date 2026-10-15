import type { Request } from 'express';
import { Router } from 'express';
import { ROLES_GESTION } from '../../config/roles';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRol } from '../../middleware/requireRol';
import { validarBody, validarDatos } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import type { Actor } from '../fuentes/fuentes.service';
import { cambiarEstadoSchema, cambiarRolSchema, idUsuarioParamSchema, listarUsuariosQuerySchema } from './usuarios.schemas';
import type { CambiarEstadoInput, CambiarRolInput } from './usuarios.schemas';
import * as usuarios from './usuarios.service';

export const usuariosRouter = Router();

// Todo este modulo exige sesion y rol de gestion: la lista de personas tiene correos y nombres
usuariosRouter.use(requireAuth);
usuariosRouter.use(requireRol(...ROLES_GESTION));

// El actor sale de la sesion, nunca del cuerpo de la peticion
function actorDe(req: Request): Actor {
    if (!req.user) throw new AppError('No has iniciado sesion', 401, 'NO_AUTENTICADO');
    return { id: req.user.id, ip: req.ip };
}

usuariosRouter.get('/', async (req, res) => {
    const consulta = validarDatos(listarUsuariosQuerySchema, req.query);
    const { usuarios: lista, total } = await usuarios.listarUsuarios(consulta);
    res.json({ ok: true, data: { usuarios: lista, total, pagina: consulta.pagina, limite: consulta.limite } });
});

usuariosRouter.get('/:id', async (req, res) => {
    const { id } = validarDatos(idUsuarioParamSchema, req.params);
    res.json({ ok: true, data: { usuario: await usuarios.obtenerUsuario(id) } });
});

usuariosRouter.patch('/:id/rol', validarBody(cambiarRolSchema), async (req, res) => {
    const { id } = validarDatos(idUsuarioParamSchema, req.params);
    const { rol } = req.body as CambiarRolInput;
    res.json({ ok: true, data: { usuario: await usuarios.cambiarRol(id, rol, actorDe(req)) } });
});

usuariosRouter.patch('/:id/estado', validarBody(cambiarEstadoSchema), async (req, res) => {
    const { id } = validarDatos(idUsuarioParamSchema, req.params);
    const { estado } = req.body as CambiarEstadoInput;
    res.json({ ok: true, data: { usuario: await usuarios.cambiarEstado(id, estado === 'activa', actorDe(req)) } });
});
