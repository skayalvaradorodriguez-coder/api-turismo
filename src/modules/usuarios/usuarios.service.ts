import { ROLES_GESTION } from '../../config/roles';
import { AppError } from '../../utils/AppError';
import { enTransaccion } from '../../utils/transaccion';
import type { Ejecutor } from '../auditoria/auditoria.repository';
import { registrar } from '../auditoria/auditoria.service';
import type { Actor } from '../fuentes/fuentes.service';
import * as repo from './usuarios.repository';
import type { FiltroUsuarios, UsuarioBloqueado, UsuarioGestion } from './usuarios.repository';
import type { RolAsignable } from './usuarios.schemas';

const noEncontrado = () => new AppError('El usuario no existe', 404, 'USUARIO_NO_ENCONTRADO');
const sinPermiso = (mensaje: string) => new AppError(mensaje, 403, 'PERMISO_INSUFICIENTE');

// ---------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------
export async function listarUsuarios(filtro: FiltroUsuarios): Promise<{ usuarios: UsuarioGestion[]; total: number }> {
    return repo.listarUsuarios(filtro);
}

export async function obtenerUsuario(id: number): Promise<UsuarioGestion> {
    const usuario = await repo.buscarUsuario(id);
    if (!usuario) throw noEncontrado();
    return usuario;
}

// ---------------------------------------------------------------
// Cambios
// ---------------------------------------------------------------

/**
 * Comprobaciones comunes a todo cambio de una cuenta. Devuelve quien lo hace (leido de la base, no de la
 * sesion) y la cuenta a cambiar, ya bloqueada.
 */
async function prepararCambio(
    usuarioId: number,
    actor: Actor,
    conexion: Ejecutor,
): Promise<{ quien: UsuarioGestion; objetivo: UsuarioBloqueado }> {
    const quien = await repo.buscarUsuario(actor.id, conexion);
    if (!quien || !quien.activo || !(ROLES_GESTION as readonly string[]).includes(quien.rol)) {
        throw sinPermiso('No tienes permiso para esta accion');
    }

    const objetivo = await repo.bloquearUsuario(usuarioId, conexion);
    if (!objetivo) throw noEncontrado();

    if (objetivo.id === quien.id) {
        throw new AppError('No puedes cambiar tu propia cuenta', 403, 'CUENTA_PROPIA');
    }
    if (objetivo.rol === 'super_admin') {
        throw new AppError('La cuenta de un super administrador no se modifica desde la plataforma', 403, 'SUPER_ADMIN_PROTEGIDO');
    }
    return { quien, objetivo };
}

export async function cambiarRol(usuarioId: number, rolNuevo: RolAsignable, actor: Actor): Promise<UsuarioGestion> {
    return enTransaccion(async (conexion) => {
        const { quien, objetivo } = await prepararCambio(usuarioId, actor, conexion);

        if (objetivo.rol === rolNuevo) throw new AppError('La cuenta ya tiene ese rol', 409, 'ROL_SIN_CAMBIOS');

        // el rol de administrador solo lo asigna o quita un super administrador
        if (quien.rol !== 'super_admin' && (objetivo.rol === 'admin' || rolNuevo === 'admin')) {
            throw sinPermiso('Solo un super administrador puede asignar o quitar el rol de administrador');
        }

        const rol = await repo.buscarRolPorCodigo(rolNuevo, conexion);
        if (!rol) throw new AppError('El rol no existe en la base de datos. Ejecuta database/010_roles.sql', 500, 'ROL_NO_CONFIGURADO');

        await repo.cambiarRol(objetivo.id, rol.id, conexion);
        await registrar(
            {
                usuarioId: quien.id,
                accion: 'usuario.cambiar_rol',
                entidad: 'usuario',
                entidadId: objetivo.id,
                detalle: { rolAnterior: objetivo.rol, rolNuevo },
                ip: actor.ip ?? null,
            },
            conexion,
        );

        const actualizado = await repo.buscarUsuario(objetivo.id, conexion);
        if (!actualizado) throw noEncontrado();
        return actualizado;
    });
}

export async function cambiarEstado(usuarioId: number, activo: boolean, actor: Actor): Promise<UsuarioGestion> {
    return enTransaccion(async (conexion) => {
        const { quien, objetivo } = await prepararCambio(usuarioId, actor, conexion);

        if (objetivo.activo === activo) {
            throw new AppError(activo ? 'La cuenta ya esta activa' : 'La cuenta ya esta desactivada', 409, 'ESTADO_SIN_CAMBIOS');
        }
        if (quien.rol !== 'super_admin' && objetivo.rol === 'admin') {
            throw sinPermiso('Solo un super administrador puede activar o desactivar a un administrador');
        }

        await repo.cambiarActivo(objetivo.id, activo, conexion);
        // al desactivar se cierran sus sesiones; al reactivar, las anteriores no vuelven a valer
        if (!activo) await repo.invalidarSesiones(objetivo.id, conexion);

        await registrar(
            {
                usuarioId: quien.id,
                accion: activo ? 'usuario.activar' : 'usuario.desactivar',
                entidad: 'usuario',
                entidadId: objetivo.id,
                detalle: { rol: objetivo.rol },
                ip: actor.ip ?? null,
            },
            conexion,
        );

        const actualizado = await repo.buscarUsuario(objetivo.id, conexion);
        if (!actualizado) throw noEncontrado();
        return actualizado;
    });
}
