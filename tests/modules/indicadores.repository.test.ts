import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/config/db';
import { crearCarga } from '../../src/modules/cargas/cargas.repository';
import { registrosDelUltimoProcesamiento } from '../../src/modules/indicadores/indicadores.repository';
import { crearProcesamiento, finalizarProcesamiento, insertarRegistros } from '../../src/modules/procesamiento/procesamiento.repository';

let conexion: PoolConnection;
let usuarioId: number;
let cargaId: number;
let archivoId: number;

beforeAll(async () => {
    const [filas] = await pool.query<RowDataPacket[]>('SELECT id FROM usuarios ORDER BY id LIMIT 1');
    const id: unknown = filas[0]?.['id'];
    if (typeof id !== 'number') throw new Error('Hace falta al menos un usuario (ejecuta crear-admin)');
    usuarioId = id;
});

// Cada prueba trabaja dentro de una transaccion que se deshace al final: no queda nada en la base
beforeEach(async () => {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    const [fuente] = await conexion.execute<ResultSetHeader>(
        "INSERT INTO fuentes (codigo, nombre, institucion, creado_por) VALUES (?, 'Fuente de prueba', 'UPSE', ?)",
        [`prueba_${randomUUID().slice(0, 8)}`, usuarioId],
    );
    cargaId = await crearCarga({ fuenteId: fuente.insertId, cargadoPor: usuarioId }, conexion);
    const [r] = await conexion.execute<ResultSetHeader>(
        `INSERT INTO archivos_originales
       (carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256, version, vigente, subido_por)
     VALUES (?, 'datos.csv', ?, 'text/csv', 10, ?, 1, 1, ?)`,
        [cargaId, `${randomUUID()}.csv`, randomUUID().replaceAll('-', '').padEnd(64, '0'), usuarioId],
    );
    archivoId = r.insertId;
});

afterEach(async () => {
    await conexion.rollback();
    conexion.release();
});

afterAll(async () => {
    await pool.end();
});

const registro = (n: number, datos: Record<string, unknown>) => ({ identificador: String(n), filaOrigen: n + 1, datos });

describe('registrosDelUltimoProcesamiento', () => {
    it('una carga sin procesamiento terminado devuelve null', async () => {
        expect(await registrosDelUltimoProcesamiento(cargaId, conexion)).toBeNull();
        // una validacion, aunque termine, no cuenta: no tiene registros
        const v = await crearProcesamiento({ cargaId, archivoId, tipo: 'validacion', ejecutadoPor: usuarioId }, conexion);
        await finalizarProcesamiento(v, { estado: 'completado', totalFilas: 0, totalErrores: 0, totalAlertas: 0 }, conexion);
        expect(await registrosDelUltimoProcesamiento(cargaId, conexion)).toBeNull();
    });

    it('un procesamiento fallido no cuenta', async () => {
        const p = await crearProcesamiento({ cargaId, archivoId, tipo: 'procesamiento', ejecutadoPor: usuarioId }, conexion);
        await finalizarProcesamiento(p, { estado: 'fallido', totalFilas: 0, totalErrores: 0, totalAlertas: 0, mensajeError: 'x' }, conexion);
        expect(await registrosDelUltimoProcesamiento(cargaId, conexion)).toBeNull();
    });

    it('devuelve los registros, como objetos, del procesamiento mas reciente', async () => {
        const viejo = await crearProcesamiento({ cargaId, archivoId, tipo: 'procesamiento', ejecutadoPor: usuarioId }, conexion);
        await insertarRegistros(viejo, cargaId, 'ots_turista_v1', [registro(1, { edad: 99 })], conexion);
        await finalizarProcesamiento(viejo, { estado: 'completado', totalFilas: 1, totalErrores: 0, totalAlertas: 0 }, conexion);

        const nuevo = await crearProcesamiento({ cargaId, archivoId, tipo: 'procesamiento', ejecutadoPor: usuarioId }, conexion);
        await insertarRegistros(nuevo, cargaId, 'ots_turista_v1', [registro(2, { edad: null, pais: 'Ecuador' }), registro(1, { edad: 30 })], conexion);
        await finalizarProcesamiento(nuevo, { estado: 'completado', totalFilas: 2, totalErrores: 0, totalAlertas: 0 }, conexion);

        const r = await registrosDelUltimoProcesamiento(cargaId, conexion);
        expect(r?.procesamientoId).toBe(nuevo);
        expect(r?.estructura).toBe('ots_turista_v1');
        expect(r?.registros).toEqual([{ edad: 30 }, { edad: null, pais: 'Ecuador' }]); // ordenados por fila de origen
    });
});
