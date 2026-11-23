import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/config/db';
import { crearCarga } from '../../src/modules/cargas/cargas.repository';
import {
    buscarProcesamiento,
    crearProcesamiento,
    existeProcesamientoCompletado,
    finalizarProcesamiento,
    insertarHallazgos,
    insertarRegistros,
    listarHallazgos,
    listarProcesamientos,
    resumirHallazgos,
} from '../../src/modules/procesamiento/procesamiento.repository';
import type { Hallazgo } from '../../src/modules/procesamiento/procesamiento.repository';

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
    archivoId = await crearArchivoDirecto(cargaId);
});

// El archivo se inserta con un INSERT simple y no con insertarArchivo(): esa funcion toma bloqueos de rango
// y, si otra prueba la usa a la vez sobre la misma tabla, MySQL puede responder "Deadlock".
async function crearArchivoDirecto(carga: number): Promise<number> {
    const [r] = await conexion.execute<ResultSetHeader>(
        `INSERT INTO archivos_originales
       (carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256, version, vigente, subido_por)
     VALUES (?, 'datos.csv', ?, 'text/csv', 10, ?, 1, 1, ?)`,
        [carga, `${randomUUID()}.csv`, randomUUID().replaceAll('-', '').padEnd(64, '0'), usuarioId],
    );
    return r.insertId;
}

afterEach(async () => {
    await conexion.rollback();
    conexion.release();
});

afterAll(async () => {
    await pool.end();
});

const hallazgo = (sobrescribir: Partial<Hallazgo> = {}): Hallazgo => ({
    fila: 1,
    columna: 'Parroquia',
    regla: 'parroquia_corregida',
    severidad: 'alerta',
    mensaje: 'Se corrigio',
    valorOriginal: 'MANGLARLTO',
    valorCorregido: 'MANGLARALTO',
    ...sobrescribir,
});

async function fuenteDe(carga: number): Promise<number> {
    const [filas] = await conexion.query<RowDataPacket[]>('SELECT fuente_id FROM cargas WHERE id = ?', [carga]);
    return Number(filas[0]?.['fuente_id']);
}

describe('procesamiento.repository: procesamientos', () => {
    it('crea un procesamiento en curso y lo lee', async () => {
        const id = await crearProcesamiento({ cargaId, archivoId, tipo: 'validacion', ejecutadoPor: usuarioId }, conexion);
        const p = await buscarProcesamiento(id, conexion);

        expect(p).toMatchObject({ id, cargaId, archivoId, tipo: 'validacion', estado: 'en_curso', totalFilas: 0, totalErrores: 0, totalAlertas: 0, mensajeError: null, ejecutadoPor: usuarioId, finalizadoEn: null });
        expect(p?.iniciadoEn).toBeInstanceOf(Date);
        expect(await buscarProcesamiento(999999999, conexion)).toBeNull();
    });

    it('finalizar guarda los totales y solo funciona una vez', async () => {
        const id = await crearProcesamiento({ cargaId, archivoId, tipo: 'procesamiento', ejecutadoPor: usuarioId }, conexion);

        expect(await finalizarProcesamiento(id, { estado: 'completado', totalFilas: 962, totalErrores: 0, totalAlertas: 114 }, conexion)).toBe(true);
        expect(await finalizarProcesamiento(id, { estado: 'fallido', totalFilas: 0, totalErrores: 0, totalAlertas: 0, mensajeError: 'otro' }, conexion)).toBe(false);

        const p = await buscarProcesamiento(id, conexion);
        expect(p).toMatchObject({ estado: 'completado', totalFilas: 962, totalErrores: 0, totalAlertas: 114, mensajeError: null });
        expect(p?.finalizadoEn).toBeInstanceOf(Date);
    });

    it('un procesamiento fallido guarda el mensaje', async () => {
        const id = await crearProcesamiento({ cargaId, archivoId, tipo: 'validacion', ejecutadoPor: usuarioId }, conexion);
        await finalizarProcesamiento(id, { estado: 'fallido', totalFilas: 0, totalErrores: 0, totalAlertas: 0, mensajeError: 'No se pudo leer el archivo' }, conexion);
        expect(await buscarProcesamiento(id, conexion)).toMatchObject({ estado: 'fallido', mensajeError: 'No se pudo leer el archivo' });
    });

    it('lista los procesamientos de la carga, el mas reciente primero, sin mezclar otras cargas', async () => {
        const otraCarga = await crearCarga({ fuenteId: await fuenteDe(cargaId), cargadoPor: usuarioId }, conexion);
        const a = await crearProcesamiento({ cargaId, archivoId, tipo: 'validacion', ejecutadoPor: usuarioId }, conexion);
        const b = await crearProcesamiento({ cargaId, archivoId, tipo: 'procesamiento', ejecutadoPor: usuarioId }, conexion);

        expect((await listarProcesamientos(cargaId, conexion)).map((p) => p.id)).toEqual([b, a]);
        expect(await listarProcesamientos(otraCarga, conexion)).toEqual([]);
    });

    it('existeProcesamientoCompletado distingue tipo y estado', async () => {
        const id = await crearProcesamiento({ cargaId, archivoId, tipo: 'procesamiento', ejecutadoPor: usuarioId }, conexion);
        expect(await existeProcesamientoCompletado(cargaId, 'procesamiento', conexion)).toBe(false); // sigue en curso

        await finalizarProcesamiento(id, { estado: 'completado', totalFilas: 1, totalErrores: 0, totalAlertas: 0 }, conexion);
        expect(await existeProcesamientoCompletado(cargaId, 'procesamiento', conexion)).toBe(true);
        expect(await existeProcesamientoCompletado(cargaId, 'validacion', conexion)).toBe(false);
    });

    it('rechaza un tipo que no existe (la base lo impide)', async () => {
        await expect(
            crearProcesamiento({ cargaId, archivoId, tipo: 'otro' as unknown as 'validacion', ejecutadoPor: usuarioId }, conexion),
        ).rejects.toThrow();
    });
});

describe('procesamiento.repository: hallazgos', () => {
    let procesamientoId: number;
    beforeEach(async () => {
        procesamientoId = await crearProcesamiento({ cargaId, archivoId, tipo: 'validacion', ejecutadoPor: usuarioId }, conexion);
    });

    it('guarda y lee hallazgos conservando los valores nulos', async () => {
        await insertarHallazgos(procesamientoId, [hallazgo(), hallazgo({ fila: null, columna: null, regla: 'archivo_vacio', severidad: 'error', mensaje: 'Vacio', valorOriginal: null, valorCorregido: null })], conexion);
        const { hallazgos, total } = await listarHallazgos(procesamientoId, { limite: 50, pagina: 1 }, conexion);

        expect(total).toBe(2);
        expect(hallazgos[0]).toMatchObject({ procesamientoId, fila: 1, columna: 'Parroquia', regla: 'parroquia_corregida', severidad: 'alerta', valorOriginal: 'MANGLARLTO', valorCorregido: 'MANGLARALTO' });
        expect(hallazgos[1]).toMatchObject({ fila: null, columna: null, severidad: 'error', valorOriginal: null, valorCorregido: null });
    });

    it('una lista vacia no hace nada', async () => {
        await insertarHallazgos(procesamientoId, [], conexion);
        expect((await listarHallazgos(procesamientoId, { limite: 50, pagina: 1 }, conexion)).total).toBe(0);
    });

    it('guarda mas de un lote (1200 hallazgos) en el mismo orden', async () => {
        const muchos = Array.from({ length: 1200 }, (_, i) => hallazgo({ fila: i + 1 }));
        await insertarHallazgos(procesamientoId, muchos, conexion);

        const pagina = await listarHallazgos(procesamientoId, { limite: 200, pagina: 6 }, conexion);
        expect(pagina.total).toBe(1200);
        expect(pagina.hallazgos).toHaveLength(200);
        expect(pagina.hallazgos[0]?.fila).toBe(1001);
        expect(pagina.hallazgos[199]?.fila).toBe(1200);
    });

    it('filtra por severidad y por regla', async () => {
        await insertarHallazgos(procesamientoId, [hallazgo(), hallazgo({ regla: 'nombre_vacio' }), hallazgo({ regla: 'registro_vacio', severidad: 'error' })], conexion);

        expect((await listarHallazgos(procesamientoId, { severidad: 'error', limite: 50, pagina: 1 }, conexion)).total).toBe(1);
        expect((await listarHallazgos(procesamientoId, { regla: 'nombre_vacio', limite: 50, pagina: 1 }, conexion)).total).toBe(1);
        expect((await listarHallazgos(procesamientoId, { severidad: 'alerta', regla: 'registro_vacio', limite: 50, pagina: 1 }, conexion)).total).toBe(0);
    });

    it('el resumen cuenta por regla y pone los errores primero', async () => {
        await insertarHallazgos(
            procesamientoId,
            [hallazgo(), hallazgo(), hallazgo({ regla: 'nombre_vacio' }), hallazgo({ regla: 'registro_vacio', severidad: 'error' })],
            conexion,
        );
        expect(await resumirHallazgos(procesamientoId, conexion)).toEqual([
            { regla: 'registro_vacio', severidad: 'error', total: 1 },
            { regla: 'parroquia_corregida', severidad: 'alerta', total: 2 },
            { regla: 'nombre_vacio', severidad: 'alerta', total: 1 },
        ]);
    });

    it('rechaza una severidad que no existe (la base lo impide)', async () => {
        await expect(insertarHallazgos(procesamientoId, [hallazgo({ severidad: 'grave' as unknown as 'error' })], conexion)).rejects.toThrow();
    });

    it('guarda texto con comillas y sentencias SQL como simple texto', async () => {
        const texto = "x'; DROP TABLE hallazgos; --";
        await insertarHallazgos(procesamientoId, [hallazgo({ valorOriginal: texto })], conexion);
        expect((await listarHallazgos(procesamientoId, { limite: 50, pagina: 1 }, conexion)).hallazgos[0]?.valorOriginal).toBe(texto);
    });
});

describe('procesamiento.repository: registros procesados', () => {
    it('guarda los registros con su JSON, ligados al procesamiento, y no admite repetir el identificador', async () => {
        const id = await crearProcesamiento({ cargaId, archivoId, tipo: 'procesamiento', ejecutadoPor: usuarioId }, conexion);
        const registros = Array.from({ length: 250 }, (_, i) => ({ identificador: String(i + 1), filaOrigen: i + 2, datos: { edad: i % 2 === 0 ? null : 29, pais: 'Ecuador' } }));
        await insertarRegistros(id, cargaId, 'ots_turista_v1', registros, conexion); // 250 filas = 3 lotes

        const [filas] = await conexion.query<RowDataPacket[]>('SELECT identificador, fila_origen, estructura, datos FROM registros_procesados WHERE procesamiento_id = ? ORDER BY id', [id]);
        expect(filas).toHaveLength(250);
        expect(filas[0]).toMatchObject({ identificador: '1', fila_origen: 2, estructura: 'ots_turista_v1' });
        expect(typeof filas[0]?.['datos'] === 'string' ? JSON.parse(filas[0]['datos'] as string) : filas[0]?.['datos']).toEqual({ edad: null, pais: 'Ecuador' });

        await expect(insertarRegistros(id, cargaId, 'ots_turista_v1', [registros[0]!], conexion)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    });

    it('un hallazgo de tipo "cambio" se guarda y se puede filtrar', async () => {
        const id = await crearProcesamiento({ cargaId, archivoId, tipo: 'procesamiento', ejecutadoPor: usuarioId }, conexion);
        await insertarHallazgos(id, [hallazgo({ severidad: 'cambio', regla: 'cero_a_faltante', valorOriginal: '0', valorCorregido: null })], conexion);
        const { hallazgos, total } = await listarHallazgos(id, { severidad: 'cambio', limite: 10, pagina: 1 }, conexion);
        expect(total).toBe(1);
        expect(hallazgos[0]).toMatchObject({ severidad: 'cambio', valorOriginal: '0', valorCorregido: null });
    });
});
