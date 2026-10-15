import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/config/db';
import {
    actualizar,
    buscarPorCodigo,
    buscarPorId,
    cambiarEstado,
    crear,
    esErrorDuplicado,
    listar,
} from '../../src/modules/fuentes/fuentes.repository';

let conexion: PoolConnection;
let usuarioId: number;

beforeAll(async () => {
    const [filas] = await pool.query<RowDataPacket[]>('SELECT id FROM usuarios ORDER BY id LIMIT 1');
    const id: unknown = filas[0]?.['id'];
    if (typeof id !== 'number') throw new Error('Hace falta al menos un usuario (ejecuta crear-admin)');
    usuarioId = id;
});

beforeEach(async () => {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
});

afterEach(async () => {
    await conexion.rollback();
    conexion.release();
});

afterAll(async () => {
    await pool.end();
});

const base = { nombre: 'Fuente de prueba', institucion: 'Institucion de prueba' };

describe('fuentes.repository (con la base real; todo se deshace)', () => {
    it('crea una fuente y la lee con los campos en camelCase', async () => {
        const id = await crear({ ...base, codigo: 'prueba_a', tipoFuente: 'Observatorio', creadoPor: usuarioId }, conexion);
        const fuente = await buscarPorId(id, conexion);

        expect(fuente).not.toBeNull();
        expect(fuente?.codigo).toBe('prueba_a');
        expect(fuente?.tipoFuente).toBe('Observatorio');
        expect(fuente?.descripcion).toBeNull();
        expect(fuente?.estado).toBe('activa');
        expect(fuente?.creadoPor).toBe(usuarioId);
    });

    it('devuelve null si la fuente no existe', async () => {
        expect(await buscarPorId(999999999, conexion)).toBeNull();
        expect(await buscarPorCodigo('no_existe_xyz', conexion)).toBeNull();
    });

    it('rechaza un codigo repetido y lo reconoce como duplicado', async () => {
        const datos = { ...base, codigo: 'prueba_dup', creadoPor: usuarioId };
        await crear(datos, conexion);
        const error = await crear(datos, conexion).then(
            () => null,
            (e: unknown) => e,
        );
        expect(esErrorDuplicado(error)).toBe(true);
    });

    it('actualiza los campos editables y no toca el codigo', async () => {
        const id = await crear({ ...base, codigo: 'prueba_edit', descripcion: 'antes', creadoPor: usuarioId }, conexion);
        await actualizar(id, { nombre: 'Nombre nuevo', institucion: 'UPSE', descripcion: null }, conexion);

        const fuente = await buscarPorId(id, conexion);
        expect(fuente?.nombre).toBe('Nombre nuevo');
        expect(fuente?.institucion).toBe('UPSE');
        expect(fuente?.descripcion).toBeNull();
        expect(fuente?.codigo).toBe('prueba_edit');
    });

    it('cambia el estado y el filtro de listar lo respeta', async () => {
        const idA = await crear({ ...base, codigo: 'prueba_a', creadoPor: usuarioId }, conexion);
        const idB = await crear({ ...base, codigo: 'prueba_b', creadoPor: usuarioId }, conexion);
        await cambiarEstado(idB, 'inactiva', conexion);

        // Se filtra por los ids creados aqui: la base puede tener otras fuentes (reales o de pruebas manuales)
        const propias = (lista: { id: number }[]) => lista.filter((f) => f.id === idA || f.id === idB);
        const inactivas = propias(await listar('inactiva', conexion));
        const activas = propias(await listar('activa', conexion));

        expect(inactivas.map((f) => f.id)).toEqual([idB]);
        expect(activas.map((f) => f.id)).toEqual([idA]);
    });

    it('trata el texto como dato, nunca como SQL (consultas parametrizadas)', async () => {
        const codigo = "prueba_'; DROP TABLE fuentes; --";
        await crear({ ...base, codigo, creadoPor: usuarioId }, conexion);

        expect((await buscarPorCodigo(codigo, conexion))?.codigo).toBe(codigo);
        expect(await listar(undefined, conexion)).toBeInstanceOf(Array); // la tabla sigue existiendo
    });

    it('esErrorDuplicado no confunde otros errores', () => {
        expect(esErrorDuplicado(new Error('otro'))).toBe(false);
        expect(esErrorDuplicado({ code: 'ER_NO_SUCH_TABLE' })).toBe(false);
        expect(esErrorDuplicado(null)).toBe(false);
    });
});