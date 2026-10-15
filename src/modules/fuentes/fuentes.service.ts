import { AppError } from '../../utils/AppError';
import { enTransaccion } from '../../utils/transaccion';
import { registrar } from '../auditoria/auditoria.service';
import * as repo from './fuentes.repository';
import type { DatosFuente, DatosNuevaFuente, EstadoFuente, Fuente } from './fuentes.repository';

/** Quien realiza la operacion (viene de la sesion, nunca del cuerpo de la peticion). */
export interface Actor {
    id: number;
    ip?: string | null;
}

const CAMPOS_EDITABLES: (keyof DatosFuente)[] = [
    'nombre',
    'institucion',
    'descripcion',
    'tipoFuente',
    'mecanismoAcceso',
    'frecuenciaActualizacion',
    'procedencia',
    'licenciaUso',
    'responsable',
];

const noEncontrada = () => new AppError('La fuente no existe', 404, 'FUENTE_NO_ENCONTRADA');

/** Solo los campos que cambiaron, con su valor anterior y el nuevo. */
function diferencias(antes: Fuente, despues: Fuente): Record<string, { antes: unknown; despues: unknown }> {
    const salida: Record<string, { antes: unknown; despues: unknown }> = {};
    for (const campo of CAMPOS_EDITABLES) {
        if (antes[campo] !== despues[campo]) salida[campo] = { antes: antes[campo], despues: despues[campo] };
    }
    return salida;
}

export async function listarFuentes(estado?: EstadoFuente): Promise<Fuente[]> {
    return repo.listar(estado);
}

export async function obtenerFuente(id: number): Promise<Fuente> {
    const fuente = await repo.buscarPorId(id);
    if (!fuente) throw noEncontrada();
    return fuente;
}

export async function crearFuente(datos: Omit<DatosNuevaFuente, 'creadoPor'>, actor: Actor): Promise<Fuente> {
    return enTransaccion(async (conexion) => {
        let id: number;
        try {
            id = await repo.crear({ ...datos, creadoPor: actor.id }, conexion);
        } catch (error) {
            if (repo.esErrorDuplicado(error)) {
                throw new AppError('Ya existe una fuente con ese codigo', 409, 'FUENTE_DUPLICADA');
            }
            throw error;
        }

        await registrar(
            {
                usuarioId: actor.id,
                accion: 'fuente.crear',
                entidad: 'fuente',
                entidadId: id,
                detalle: { codigo: datos.codigo, nombre: datos.nombre },
                ip: actor.ip,
            },
            conexion,
        );

        const fuente = await repo.buscarPorId(id, conexion);
        if (!fuente) throw noEncontrada();
        return fuente;
    });
}

export async function editarFuente(id: number, datos: DatosFuente, actor: Actor): Promise<Fuente> {
    return enTransaccion(async (conexion) => {
        const antes = await repo.buscarPorId(id, conexion);
        if (!antes) throw noEncontrada();

        await repo.actualizar(id, datos, conexion);

        const despues = await repo.buscarPorId(id, conexion);
        if (!despues) throw noEncontrada();

        const cambios = diferencias(antes, despues);
        if (Object.keys(cambios).length > 0) {
            await registrar(
                {
                    usuarioId: actor.id,
                    accion: 'fuente.editar',
                    entidad: 'fuente',
                    entidadId: id,
                    detalle: { cambios },
                    ip: actor.ip,
                },
                conexion,
            );
        }
        return despues;
    });
}

export async function cambiarEstadoFuente(id: number, estado: EstadoFuente, actor: Actor): Promise<Fuente> {
    return enTransaccion(async (conexion) => {
        const antes = await repo.buscarPorId(id, conexion);
        if (!antes) throw noEncontrada();
        if (antes.estado === estado) return antes; // ya estaba asi: no hay nada que hacer ni registrar

        await repo.cambiarEstado(id, estado, conexion);
        await registrar(
            {
                usuarioId: actor.id,
                accion: estado === 'activa' ? 'fuente.activar' : 'fuente.desactivar',
                entidad: 'fuente',
                entidadId: id,
                detalle: { estadoAnterior: antes.estado, estadoNuevo: estado },
                ip: actor.ip,
            },
            conexion,
        );

        const despues = await repo.buscarPorId(id, conexion);
        if (!despues) throw noEncontrada();
        return despues;
    });
}