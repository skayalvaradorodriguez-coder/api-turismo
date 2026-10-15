import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fuente } from '../../src/modules/fuentes/fuentes.repository';
import type { AppError } from '../../src/utils/AppError';

const { conexion, repo, registrar } = vi.hoisted(() => ({
    conexion: { nombre: 'conexion-falsa' },
    repo: { listar: vi.fn(), buscarPorId: vi.fn(), crear: vi.fn(), actualizar: vi.fn(), cambiarEstado: vi.fn() },
    registrar: vi.fn(),
}));

vi.mock('../../src/utils/transaccion', () => ({
    enTransaccion: (trabajo: (c: unknown) => Promise<unknown>) => trabajo(conexion),
}));
vi.mock('../../src/modules/auditoria/auditoria.service', () => ({ registrar }));
vi.mock('../../src/modules/fuentes/fuentes.repository', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../src/modules/fuentes/fuentes.repository')>()),
    ...repo,
}));

import {
    cambiarEstadoFuente,
    crearFuente,
    editarFuente,
    obtenerFuente,
} from '../../src/modules/fuentes/fuentes.service';

const fuente: Fuente = {
    id: 5,
    codigo: 'observatorio_upse',
    nombre: 'Observatorio',
    institucion: 'UPSE',
    descripcion: null,
    tipoFuente: null,
    mecanismoAcceso: null,
    frecuenciaActualizacion: null,
    procedencia: null,
    licenciaUso: null,
    responsable: null,
    estado: 'activa',
    creadoPor: 1,
    creadaEn: new Date('2026-01-01T00:00:00Z'),
    actualizadaEn: new Date('2026-01-01T00:00:00Z'),
};
const actor = { id: 1, ip: '1.2.3.4' };
const datosCrear = { codigo: 'observatorio_upse', nombre: 'Observatorio', institucion: 'UPSE' };

async function fallo(promesa: Promise<unknown>): Promise<AppError> {
    try {
        await promesa;
    } catch (e) {
        return e as AppError;
    }
    throw new Error('Se esperaba un error y no ocurrio');
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('crearFuente', () => {
    it('crea la fuente, la registra en la bitacora y la devuelve', async () => {
        repo.crear.mockResolvedValue(5);
        repo.buscarPorId.mockResolvedValue(fuente);

        const resultado = await crearFuente(datosCrear, actor);

        expect(resultado).toEqual(fuente);
        expect(repo.crear).toHaveBeenCalledWith({ ...datosCrear, creadoPor: 1 }, conexion);
        expect(registrar).toHaveBeenCalledWith(
            {
                usuarioId: 1,
                accion: 'fuente.crear',
                entidad: 'fuente',
                entidadId: 5,
                detalle: { codigo: 'observatorio_upse', nombre: 'Observatorio' },
                ip: '1.2.3.4',
            },
            conexion,
        );
    });

    it('un codigo repetido responde 409 y no registra nada', async () => {
        repo.crear.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

        const error = await fallo(crearFuente(datosCrear, actor));

        expect(error.statusCode).toBe(409);
        expect(error.code).toBe('FUENTE_DUPLICADA');
        expect(registrar).not.toHaveBeenCalled();
    });

    it('relanza tal cual cualquier otro error de la base', async () => {
        repo.crear.mockRejectedValue(new Error('boom'));

        await expect(crearFuente(datosCrear, actor)).rejects.toThrow('boom');
        expect(registrar).not.toHaveBeenCalled();
    });
});

describe('editarFuente', () => {
    it('una fuente inexistente responde 404 y no modifica nada', async () => {
        repo.buscarPorId.mockResolvedValue(null);

        const error = await fallo(editarFuente(99, { nombre: 'Nuevo', institucion: 'UPSE' }, actor));

        expect(error.statusCode).toBe(404);
        expect(error.code).toBe('FUENTE_NO_ENCONTRADA');
        expect(repo.actualizar).not.toHaveBeenCalled();
    });

    it('registra solo los campos que cambiaron, con su valor anterior y nuevo', async () => {
        repo.buscarPorId.mockResolvedValueOnce(fuente).mockResolvedValueOnce({ ...fuente, nombre: 'Nuevo' });

        await editarFuente(5, { nombre: 'Nuevo', institucion: 'UPSE' }, actor);

        expect(registrar).toHaveBeenCalledWith(
            expect.objectContaining({
                usuarioId: 1,
                accion: 'fuente.editar',
                entidadId: 5,
                detalle: { cambios: { nombre: { antes: 'Observatorio', despues: 'Nuevo' } } },
            }),
            conexion,
        );
    });

    it('si no cambia nada, no registra en la bitacora', async () => {
        repo.buscarPorId.mockResolvedValue(fuente);

        await editarFuente(5, { nombre: 'Observatorio', institucion: 'UPSE' }, actor);

        expect(registrar).not.toHaveBeenCalled();
    });
});

describe('cambiarEstadoFuente', () => {
    it('desactiva la fuente y lo registra', async () => {
        repo.buscarPorId.mockResolvedValueOnce(fuente).mockResolvedValueOnce({ ...fuente, estado: 'inactiva' });

        const resultado = await cambiarEstadoFuente(5, 'inactiva', actor);

        expect(resultado.estado).toBe('inactiva');
        expect(repo.cambiarEstado).toHaveBeenCalledWith(5, 'inactiva', conexion);
        expect(registrar).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: 'fuente.desactivar',
                detalle: { estadoAnterior: 'activa', estadoNuevo: 'inactiva' },
            }),
            conexion,
        );
    });

    it('si ya tenia ese estado, no hace nada ni registra', async () => {
        repo.buscarPorId.mockResolvedValue(fuente);

        await cambiarEstadoFuente(5, 'activa', actor);

        expect(repo.cambiarEstado).not.toHaveBeenCalled();
        expect(registrar).not.toHaveBeenCalled();
    });

    it('una fuente inexistente responde 404', async () => {
        repo.buscarPorId.mockResolvedValue(null);

        const error = await fallo(cambiarEstadoFuente(99, 'inactiva', actor));

        expect(error.statusCode).toBe(404);
    });
});

describe('obtenerFuente', () => {
    it('devuelve la fuente si existe', async () => {
        repo.buscarPorId.mockResolvedValue(fuente);
        expect(await obtenerFuente(5)).toEqual(fuente);
    });

    it('responde 404 si no existe', async () => {
        repo.buscarPorId.mockResolvedValue(null);
        const error = await fallo(obtenerFuente(99));
        expect(error.statusCode).toBe(404);
    });
});