import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/config/db';
import {
    buscarArchivo,
    buscarCargaPorId,
    crearCarga,
    esDuplicadoDe,
    estructuraPerteneceAFuente,
    guardarMetadatos,
    insertarArchivo,
    listarArchivos,
    listarCargas,
    listarMetadatos,
    transicionarEstado,
} from '../../src/modules/cargas/cargas.repository';

let conexion: PoolConnection;
let usuarioId: number;
let fuenteId: number;

beforeAll(async () => {
    const [filas] = await pool.query<RowDataPacket[]>('SELECT id FROM usuarios ORDER BY id LIMIT 1');
    const id: unknown = filas[0]?.['id'];
    if (typeof id !== 'number') throw new Error('Hace falta al menos un usuario (ejecuta crear-admin)');
    usuarioId = id;
});

// Cada prueba trabaja dentro de una transaccion que se deshace al final: no queda nada en la base.
// El codigo de la fuente es distinto en cada ejecucion para no chocar con fuentes reales.
beforeEach(async () => {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    const [r] = await conexion.execute<ResultSetHeader>(
        "INSERT INTO fuentes (codigo, nombre, institucion, creado_por) VALUES (?, 'Fuente de prueba', 'UPSE', ?)",
        [`prueba_${randomUUID().slice(0, 8)}`, usuarioId],
    );
    fuenteId = r.insertId;
});

afterEach(async () => {
    await conexion.rollback();
    conexion.release();
});

afterAll(async () => {
    await pool.end();
});

const archivo = (cargaId: number, sobrescribir: Partial<Parameters<typeof insertarArchivo>[0]> = {}) => ({
    cargaId,
    nombreOriginal: 'datos.csv',
    nombreAlmacenado: `${Math.random().toString(16).slice(2)}.csv`,
    tipoMime: 'text/csv',
    tamanoBytes: 123,
    sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
    subidoPor: usuarioId,
    ...sobrescribir,
});

describe('cargas.repository (con la base real; todo se deshace)', () => {
    it('crea una carga y la lee con fechas como texto y valores por defecto', async () => {
        const id = await crearCarga(
            { fuenteId, descripcion: 'Carnaval 2026', periodoDesde: '2026-02-14', periodoHasta: '2026-02-18', cargadoPor: usuarioId },
            conexion,
        );
        const carga = await buscarCargaPorId(id, conexion);

        expect(carga).not.toBeNull();
        expect(carga?.fuenteId).toBe(fuenteId);
        expect(carga?.estado).toBe('recibida');
        expect(carga?.nivelIngreso).toBe(1);
        expect(carga?.periodoDesde).toBe('2026-02-14');
        expect(carga?.periodoHasta).toBe('2026-02-18');
        expect(carga?.estructuraId).toBeNull();
        expect(carga?.motivoRechazo).toBeNull();
        expect(carga?.cargadoPor).toBe(usuarioId);
    });

    it('devuelve null si la carga no existe', async () => {
        expect(await buscarCargaPorId(999999999, conexion)).toBeNull();
    });

    it('lista con filtros y paginas, y cuenta el total', async () => {
        const ids = [];
        for (let i = 0; i < 3; i++) ids.push(await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion));
        await transicionarEstado(ids[0] as number, ['recibida'], 'rechazada', 'Prueba de rechazo', conexion);

        const todas = await listarCargas({ fuenteId, limite: 50, pagina: 1 }, conexion);
        expect(todas.total).toBe(3);
        expect(todas.cargas.map((c) => c.id)).toEqual([...ids].reverse()); // las mas nuevas primero

        const pagina2 = await listarCargas({ fuenteId, limite: 2, pagina: 2 }, conexion);
        expect(pagina2.total).toBe(3);
        expect(pagina2.cargas).toHaveLength(1);

        const rechazadas = await listarCargas({ fuenteId, estado: 'rechazada', limite: 50, pagina: 1 }, conexion);
        expect(rechazadas.total).toBe(1);
        expect(rechazadas.cargas[0]?.id).toBe(ids[0]);
    });

    it('transicionarEstado cambia el estado solo una vez (comprobar y cambiar juntos)', async () => {
        const id = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);

        expect(await transicionarEstado(id, ['recibida', 'validada'], 'rechazada', 'Archivo incompleto', conexion)).toBe(true);
        expect(await transicionarEstado(id, ['recibida', 'validada'], 'rechazada', 'Otro motivo', conexion)).toBe(false);

        const carga = await buscarCargaPorId(id, conexion);
        expect(carga?.estado).toBe('rechazada');
        expect(carga?.motivoRechazo).toBe('Archivo incompleto');
    });

    it('transicionarEstado respeta los estados de origen y una lista vacia no hace nada', async () => {
        const id = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);

        expect(await transicionarEstado(id, ['validada'], 'procesada', null, conexion)).toBe(false);
        expect(await transicionarEstado(id, [], 'procesada', null, conexion)).toBe(false);
        expect(await transicionarEstado(999999999, ['recibida'], 'rechazada', 'x', conexion)).toBe(false);
        expect((await buscarCargaPorId(id, conexion))?.estado).toBe('recibida');
    });

    it('un archivo nuevo con el mismo nombre es la version 2 y la anterior deja de ser vigente', async () => {
        const cargaId = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);
        await insertarArchivo(archivo(cargaId), conexion);
        await insertarArchivo(archivo(cargaId), conexion);

        const archivos = await listarArchivos(cargaId, conexion);
        expect(archivos.map((a) => [a.version, a.vigente])).toEqual([
            [2, true],
            [1, false],
        ]);
    });

    it('el mismo contenido (sha256) dos veces en una carga se rechaza', async () => {
        const cargaId = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);
        const sha = 'a'.repeat(64);
        await insertarArchivo(archivo(cargaId, { sha256: sha }), conexion);

        const error = await insertarArchivo(archivo(cargaId, { sha256: sha, nombreOriginal: 'otro.csv' }), conexion).then(
            () => null,
            (e: unknown) => e,
        );
        expect(esDuplicadoDe(error, 'uq_archivos_carga_sha')).toBe(true);
    });

    it('el mismo contenido en otra carga si se permite', async () => {
        const a = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);
        const b = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);
        const sha = 'b'.repeat(64);

        await insertarArchivo(archivo(a, { sha256: sha }), conexion);
        await expect(insertarArchivo(archivo(b, { sha256: sha }), conexion)).resolves.toBeTypeOf('number');
    });

    it('archivos con distinto nombre son independientes y los dos quedan vigentes', async () => {
        const cargaId = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);
        await insertarArchivo(archivo(cargaId, { nombreOriginal: 'uno.csv' }), conexion);
        await insertarArchivo(archivo(cargaId, { nombreOriginal: 'dos.csv' }), conexion);

        const archivos = await listarArchivos(cargaId, conexion);
        expect(archivos).toHaveLength(2);
        expect(archivos.every((a) => a.vigente && a.version === 1)).toBe(true);
    });

    it('buscarArchivo no encuentra un archivo de otra carga', async () => {
        const a = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);
        const b = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);
        const archivoId = await insertarArchivo(archivo(a), conexion);

        expect((await buscarArchivo(archivoId, a, conexion))?.id).toBe(archivoId);
        expect(await buscarArchivo(archivoId, b, conexion)).toBeNull();
    });

    it('trata nombres con comillas y sentencias SQL como simple texto', async () => {
        const cargaId = await crearCarga({ fuenteId, descripcion: "x'; DROP TABLE cargas; --", cargadoPor: usuarioId }, conexion);
        const nombre = "dato'; DROP TABLE archivos_originales; --.csv";
        await insertarArchivo(archivo(cargaId, { nombreOriginal: nombre }), conexion);

        expect((await listarArchivos(cargaId, conexion))[0]?.nombreOriginal).toBe(nombre);
        expect((await buscarCargaPorId(cargaId, conexion))?.descripcion).toBe("x'; DROP TABLE cargas; --");
    });

    it('guarda metadatos, cambia el valor de uno existente sin duplicarlo y vacio no hace nada', async () => {
        const cargaId = await crearCarga({ fuenteId, cargadoPor: usuarioId }, conexion);

        await guardarMetadatos(cargaId, { cobertura: 'Provincia', 'Tamaño de muestra': '385' }, conexion);
        await guardarMetadatos(cargaId, { cobertura: 'Salinas', metodologia: 'Encuesta' }, conexion);
        await guardarMetadatos(cargaId, {}, conexion);

        expect(await listarMetadatos(cargaId, conexion)).toEqual([
            { clave: 'cobertura', valor: 'Salinas' },
            { clave: 'metodologia', valor: 'Encuesta' },
            { clave: 'Tamaño de muestra', valor: '385' },
        ]);
    });

    it('estructuraPerteneceAFuente solo acepta una estructura de esa misma fuente', async () => {
        const [otra] = await conexion.execute<ResultSetHeader>(
            "INSERT INTO fuentes (codigo, nombre, institucion, creado_por) VALUES (?, 'Otra fuente', 'UPSE', ?)",
            [`prueba_${randomUUID().slice(0, 8)}`, usuarioId],
        );
        const [estructura] = await conexion.execute<ResultSetHeader>(
            "INSERT INTO estructuras (fuente_id, nombre) VALUES (?, 'Encuesta 2026')",
            [fuenteId],
        );

        expect(await estructuraPerteneceAFuente(estructura.insertId, fuenteId, conexion)).toBe(true);
        expect(await estructuraPerteneceAFuente(estructura.insertId, otra.insertId, conexion)).toBe(false);
        expect(await estructuraPerteneceAFuente(999999999, fuenteId, conexion)).toBe(false);
    });

    it('esDuplicadoDe no confunde otros errores ni otras restricciones', () => {
        expect(esDuplicadoDe(new Error('otro'), 'uq_archivos_carga_sha')).toBe(false);
        expect(esDuplicadoDe(null, 'uq_archivos_carga_sha')).toBe(false);
        expect(
            esDuplicadoDe({ code: 'ER_DUP_ENTRY', message: "Duplicate entry 'x' for key 'uq_archivos_vigente'" }, 'uq_archivos_carga_sha'),
        ).toBe(false);
        expect(
            esDuplicadoDe({ code: 'ER_DUP_ENTRY', message: "Duplicate entry 'x' for key 'uq_archivos_carga_sha'" }, 'uq_archivos_carga_sha'),
        ).toBe(true);
    });
});