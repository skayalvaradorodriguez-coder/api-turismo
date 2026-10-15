import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/config/db';
import { crearCarga, esDuplicadoDe, insertarArchivo } from '../../src/modules/cargas/cargas.repository';
import type { Hallazgo, RegistroCatastro } from '../../src/modules/procesamiento/catastro.reglas';
import {
    buscarProcesamiento,
    contarRegistros,
    crearProcesamiento,
    existeProcesamientoCompletado,
    finalizarProcesamiento,
    insertarHallazgos,
    insertarRegistros,
    listarHallazgos,
    listarProcesamientos,
    listarRegistros,
    resumirHallazgos,
} from '../../src/modules/procesamiento/procesamiento.repository';

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
    archivoId = await insertarArchivo(
        {
            cargaId,
            nombreOriginal: 'catastro.csv',
            nombreAlmacenado: `${randomUUID()}.csv`,
            tipoMime: 'text/csv',
            tamanoBytes: 10,
            sha256: randomUUID().replaceAll('-', '').padEnd(64, '0'),
            subidoPor: usuarioId,
        },
        conexion,
    );
});

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

const registro = (n: number, sobrescribir: Partial<RegistroCatastro> = {}): RegistroCatastro => ({
    filaOrigen: n,
    numeroRegistro: `0100090174001.001.${String(1000000 + n)}`,
    ruc: '0100090174001',
    nombreComercial: `HOSTERIA ${n}`,
    actividad: 'ALOJAMIENTO',
    clasificacion: 'HOSTERÍA',
    categoria: '3 Estrellas',
    categoriaOriginal: '3 Estrellas',
    categoriaSimbolo: 'estrellas',
    categoriaNivel: 3,
    propietario: 'PEREZ JUAN',
    provincia: 'SANTA ELENA',
    canton: 'SANTA ELENA',
    parroquia: 'COLONCHE',
    parroquiaOriginal: 'COLONCHE',
    estadoRegistro: 'RATIFICADO',
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

describe('procesamiento.repository: registros del Catastro', () => {
    it('guarda mas de un lote (1100 registros) y los cuenta', async () => {
        await insertarRegistros(cargaId, archivoId, Array.from({ length: 1100 }, (_, i) => registro(i + 1)), conexion);
        expect(await contarRegistros(cargaId, conexion)).toBe(1100);
    });

    it('una lista vacia no hace nada', async () => {
        await insertarRegistros(cargaId, archivoId, [], conexion);
        expect(await contarRegistros(cargaId, conexion)).toBe(0);
    });

    it('lista con paginas y en el orden del archivo original', async () => {
        await insertarRegistros(cargaId, archivoId, [3, 1, 2, 5, 4].map((n) => registro(n)), conexion);
        const p = await listarRegistros(cargaId, { limite: 2, pagina: 2 }, true, conexion);

        expect(p.total).toBe(5);
        expect(p.registros.map((r) => r.filaOrigen)).toEqual([3, 4]);
    });

    it('conserva los valores nulos, el simbolo y el nivel de la categoria', async () => {
        await insertarRegistros(cargaId, archivoId, [registro(1, { nombreComercial: null, propietario: null, categoria: 'Categoría Única', categoriaOriginal: 'Categoria Unica', categoriaSimbolo: 'unica', categoriaNivel: null })], conexion);
        const { registros } = await listarRegistros(cargaId, { limite: 10, pagina: 1 }, true, conexion);

        expect(registros[0]).toMatchObject({ cargaId, archivoId, nombreComercial: null, propietario: null, categoria: 'Categoría Única', categoriaOriginal: 'Categoria Unica', categoriaSimbolo: 'unica', categoriaNivel: null, ruc: '0100090174001' });
    });

    it('el RUC conserva los ceros a la izquierda', async () => {
        await insertarRegistros(cargaId, archivoId, [registro(1, { ruc: '0000000000001' })], conexion);
        expect((await listarRegistros(cargaId, { limite: 10, pagina: 1 }, true, conexion)).registros[0]?.ruc).toBe('0000000000001');
    });

    it('sin permiso para datos sensibles, ruc y propietario salen vacios', async () => {
        await insertarRegistros(cargaId, archivoId, [registro(1)], conexion);

        const oculto = (await listarRegistros(cargaId, { limite: 10, pagina: 1 }, false, conexion)).registros[0];
        expect(oculto?.ruc).toBeNull();
        expect(oculto?.propietario).toBeNull();
        expect(oculto?.numeroRegistro).toBe('0100090174001.001.1000001');

        const visible = (await listarRegistros(cargaId, { limite: 10, pagina: 1 }, true, conexion)).registros[0];
        expect(visible?.ruc).toBe('0100090174001');
        expect(visible?.propietario).toBe('PEREZ JUAN');
    });

    it('filtra por canton, parroquia y clasificacion', async () => {
        await insertarRegistros(
            cargaId,
            archivoId,
            [
                registro(1),
                registro(2, { canton: 'SALINAS', parroquia: 'ANCONCITO' }),
                registro(3, { canton: 'SALINAS', parroquia: 'SALINAS', clasificacion: 'HOTEL' }),
            ],
            conexion,
        );
        const pedir = (f: object) => listarRegistros(cargaId, { limite: 50, pagina: 1, ...f }, false, conexion);

        expect((await pedir({ canton: 'SALINAS' })).total).toBe(2);
        expect((await pedir({ parroquia: 'ANCONCITO' })).registros.map((r) => r.filaOrigen)).toEqual([2]);
        expect((await pedir({ canton: 'SALINAS', clasificacion: 'HOTEL' })).registros.map((r) => r.filaOrigen)).toEqual([3]);
    });

    it('un numero de registro repetido en la misma carga se rechaza y no queda ninguno de ese lote', async () => {
        const error = await insertarRegistros(cargaId, archivoId, [registro(1), registro(2, { numeroRegistro: registro(1).numeroRegistro })], conexion).then(
            () => null,
            (e: unknown) => e,
        );
        expect(esDuplicadoDe(error, 'uq_catastro_carga_registro')).toBe(true);
    });

    it('una fila de origen repetida en la misma carga se rechaza', async () => {
        const error = await insertarRegistros(cargaId, archivoId, [registro(1), registro(1, { numeroRegistro: '0100090174001.001.9999999' })], conexion).then(
            () => null,
            (e: unknown) => e,
        );
        expect(esDuplicadoDe(error, 'uq_catastro_carga_fila')).toBe(true);
    });

    it('el mismo numero de registro en otra carga si se permite', async () => {
        const otra = await crearCarga({ fuenteId: await fuenteDe(cargaId), cargadoPor: usuarioId }, conexion);
        const otroArchivo = await insertarArchivo(
            { cargaId: otra, nombreOriginal: 'c.csv', nombreAlmacenado: `${randomUUID()}.csv`, tipoMime: 'text/csv', tamanoBytes: 1, sha256: 'c'.repeat(64), subidoPor: usuarioId },
            conexion,
        );
        await insertarRegistros(cargaId, archivoId, [registro(1)], conexion);
        await expect(insertarRegistros(otra, otroArchivo, [registro(1)], conexion)).resolves.toBeUndefined();
    });

    it('trata comillas y sentencias SQL como simple texto', async () => {
        const texto = "x'; DROP TABLE catastro_establecimientos; --";
        await insertarRegistros(cargaId, archivoId, [registro(1, { nombreComercial: texto })], conexion);
        expect((await listarRegistros(cargaId, { limite: 10, pagina: 1 }, false, conexion)).registros[0]?.nombreComercial).toBe(texto);
    });
});
