import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const carpetas = vi.hoisted(() => ({ raiz: '', originales: '' }));

vi.mock('../../src/config/storage', () => ({
    get RAIZ_ORIGINALES() {
        return carpetas.originales;
    },
}));
vi.mock('../../src/utils/transaccion', () => ({
    enTransaccion: (trabajo: (conexion: unknown) => Promise<unknown>) => trabajo({ conexion: 'falsa' }),
}));
vi.mock('../../src/modules/auditoria/auditoria.service', () => ({ registrar: vi.fn() }));
vi.mock('../../src/modules/fuentes/fuentes.repository', () => ({ buscarPorId: vi.fn() }));
vi.mock('../../src/modules/cargas/cargas.repository', async (importarOriginal) => {
    const original = await importarOriginal<typeof import('../../src/modules/cargas/cargas.repository')>();
    return {
        ...original, // se conserva esDuplicadoDe real
        crearCarga: vi.fn(),
        buscarCargaPorId: vi.fn(),
        listarCargas: vi.fn(),
        transicionarEstado: vi.fn(),
        estructuraPerteneceAFuente: vi.fn(),
        insertarArchivo: vi.fn(),
        listarArchivos: vi.fn(),
        buscarArchivo: vi.fn(),
        guardarMetadatos: vi.fn(),
        listarMetadatos: vi.fn(),
    };
});

import { registrar } from '../../src/modules/auditoria/auditoria.service';
import * as repo from '../../src/modules/cargas/cargas.repository';
import type { Carga } from '../../src/modules/cargas/cargas.repository';
import * as servicio from '../../src/modules/cargas/cargas.service';
import * as fuentes from '../../src/modules/fuentes/fuentes.repository';

const actor = { id: 7, ip: '10.0.0.5' };
const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;

const cargaBase = (cambios: Partial<Carga> = {}): Carga => ({
    id: 10,
    fuenteId: 1,
    estructuraId: null,
    descripcion: null,
    periodoDesde: null,
    periodoHasta: null,
    nivelIngreso: 1,
    estado: 'recibida',
    motivoRechazo: null,
    cargadoPor: 7,
    publicadaPor: null,
    publicadaEn: null,
    creadaEn: new Date(),
    actualizadaEn: new Date(),
    ...cambios,
});

const datosCarga = (cambios: object = {}) => ({
    fuenteId: 1,
    estructuraId: undefined,
    descripcion: null,
    periodoDesde: undefined,
    periodoHasta: undefined,
    nivelIngreso: 1,
    metadatos: { cobertura: 'Provincia' },
    ...cambios,
});

let temporal: string;
let contador = 0;

/** Crea un archivo en la carpeta temporal, como lo haria la recepcion de la peticion. */
async function recibir(nombreOriginal: string, contenido: string | Buffer) {
    const rutaTemporal = path.join(temporal, `recibido-${++contador}.tmp`);
    await writeFile(rutaTemporal, contenido);
    return { rutaTemporal, nombreOriginal };
}

const enOriginales = () => readdir(carpetas.originales);
const enTemporal = () => readdir(temporal);

beforeAll(async () => {
    carpetas.raiz = await mkdtemp(path.join(tmpdir(), 'cargas-svc-'));
    carpetas.originales = path.join(carpetas.raiz, 'originales');
    temporal = path.join(carpetas.raiz, 'tmp');
});
afterAll(async () => {
    await rm(carpetas.raiz, { recursive: true, force: true });
});

beforeEach(async () => {
    vi.resetAllMocks();
    await rm(carpetas.originales, { recursive: true, force: true });
    await rm(temporal, { recursive: true, force: true });
    await mkdir(carpetas.originales, { recursive: true });
    await mkdir(temporal, { recursive: true });

    m(fuentes.buscarPorId).mockResolvedValue({ id: 1, estado: 'activa', codigo: 'encuesta' });
    m(repo.estructuraPerteneceAFuente).mockResolvedValue(true);
    m(repo.crearCarga).mockResolvedValue(10);
    m(repo.insertarArchivo).mockResolvedValue(55);
    m(repo.buscarCargaPorId).mockResolvedValue(cargaBase());
    m(repo.listarArchivos).mockResolvedValue([]);
    m(repo.listarMetadatos).mockResolvedValue([]);
    m(repo.transicionarEstado).mockResolvedValue(true);
});

describe('crearCarga', () => {
    it('guarda el original con nombre aleatorio, registra todo y deja limpia la carpeta temporal', async () => {
        const recibido = await recibir('santa_elena.csv', 'a,b\n1,2\n');
        const detalle = await servicio.crearCarga(datosCarga(), recibido, actor);

        expect(detalle.carga.id).toBe(10);
        const guardados = await enOriginales();
        expect(guardados).toHaveLength(1);
        expect(guardados[0]).toMatch(/^[0-9a-f-]{36}\.csv$/);
        expect(await readFile(path.join(carpetas.originales, guardados[0] as string), 'utf8')).toBe('a,b\n1,2\n');
        expect(await enTemporal()).toEqual([]);

        const archivo = m(repo.insertarArchivo).mock.calls[0]?.[0] as Record<string, unknown>;
        expect(archivo).toMatchObject({
            cargaId: 10,
            nombreOriginal: 'santa_elena.csv',
            nombreAlmacenado: guardados[0],
            tipoMime: 'text/csv',
            tamanoBytes: 8,
            subidoPor: 7,
        });
        expect(archivo['sha256']).toMatch(/^[0-9a-f]{64}$/);

        expect(repo.guardarMetadatos).toHaveBeenCalledWith(10, { cobertura: 'Provincia' }, expect.anything());
        expect(m(repo.crearCarga).mock.calls[0]?.[0]).toMatchObject({ fuenteId: 1, cargadoPor: 7 });
        expect(registrar).toHaveBeenCalledWith(
            expect.objectContaining({ usuarioId: 7, accion: 'carga.crear', entidad: 'carga', entidadId: 10, ip: '10.0.0.5' }),
            expect.anything(),
        );
    });

    it('del nombre que manda el usuario solo conserva el nombre final, nunca una ruta', async () => {
        const recibido = await recibir('..\\..\\windows\\datos.csv', 'a,b\n');
        await servicio.crearCarga(datosCarga(), recibido, actor);

        expect(m(repo.insertarArchivo).mock.calls[0]?.[0]).toMatchObject({ nombreOriginal: 'datos.csv' });
        expect(await enOriginales()).toHaveLength(1);
    });

    it('rechaza una fuente que no existe y limpia el temporal', async () => {
        m(fuentes.buscarPorId).mockResolvedValue(null);
        const recibido = await recibir('a.csv', 'a,b\n');

        await expect(servicio.crearCarga(datosCarga(), recibido, actor)).rejects.toMatchObject({
            statusCode: 404,
            code: 'FUENTE_NO_ENCONTRADA',
        });
        expect(await enOriginales()).toEqual([]);
        expect(await enTemporal()).toEqual([]);
        expect(repo.crearCarga).not.toHaveBeenCalled();
    });

    it('rechaza una fuente inactiva', async () => {
        m(fuentes.buscarPorId).mockResolvedValue({ id: 1, estado: 'inactiva', codigo: 'x' });
        const recibido = await recibir('a.csv', 'a,b\n');

        await expect(servicio.crearCarga(datosCarga(), recibido, actor)).rejects.toMatchObject({
            statusCode: 409,
            code: 'FUENTE_INACTIVA',
        });
        expect(await enTemporal()).toEqual([]);
    });

    it('rechaza una estructura que no es de esa fuente', async () => {
        m(repo.estructuraPerteneceAFuente).mockResolvedValue(false);
        const recibido = await recibir('a.csv', 'a,b\n');

        await expect(servicio.crearCarga(datosCarga({ estructuraId: 9 }), recibido, actor)).rejects.toMatchObject({
            statusCode: 422,
            code: 'ESTRUCTURA_INVALIDA',
        });
        expect(repo.estructuraPerteneceAFuente).toHaveBeenCalledWith(9, 1, expect.anything());
        expect(repo.crearCarga).not.toHaveBeenCalled();
    });

    it.each([
        ['un tipo que no esta permitido', 'programa.exe', 'MZ\x90\x00', 'TIPO_ARCHIVO_NO_PERMITIDO'],
        ['un archivo sin extension', 'datos', 'a,b\n', 'TIPO_ARCHIVO_NO_PERMITIDO'],
        ['un pdf que en realidad es texto', 'informe.pdf', 'esto no es un pdf', 'CONTENIDO_NO_COINCIDE'],
        ['un csv con bytes nulos', 'datos.csv', Buffer.from([0x61, 0x00, 0x62]), 'CONTENIDO_NO_COINCIDE'],
        ['un archivo vacio', 'vacio.csv', '', 'ARCHIVO_VACIO'],
    ])('rechaza %s (422) y no guarda nada', async (_etiqueta, nombre, contenido, codigo) => {
        const recibido = await recibir(nombre, contenido);

        await expect(servicio.crearCarga(datosCarga(), recibido, actor)).rejects.toMatchObject({ statusCode: 422, code: codigo });
        expect(await enOriginales()).toEqual([]);
        expect(await enTemporal()).toEqual([]);
        expect(repo.crearCarga).not.toHaveBeenCalled();
    });

    it('si el mismo contenido ya estaba, responde 409 y no deja archivos sueltos', async () => {
        m(repo.insertarArchivo).mockRejectedValue(
            Object.assign(new Error("Duplicate entry 'x' for key 'uq_archivos_carga_sha'"), { code: 'ER_DUP_ENTRY' }),
        );
        const recibido = await recibir('a.csv', 'a,b\n');

        await expect(servicio.crearCarga(datosCarga(), recibido, actor)).rejects.toMatchObject({
            statusCode: 409,
            code: 'ARCHIVO_DUPLICADO',
        });
        expect(await enOriginales()).toEqual([]);
        expect(await enTemporal()).toEqual([]);
    });

    it('si la bitacora falla despues de mover el archivo, el archivo movido se borra', async () => {
        m(registrar).mockRejectedValue(new Error('bitacora caida'));
        const recibido = await recibir('a.csv', 'a,b\n');

        await expect(servicio.crearCarga(datosCarga(), recibido, actor)).rejects.toThrow('bitacora caida');
        expect(await enOriginales()).toEqual([]);
        expect(await enTemporal()).toEqual([]);
    });
});

describe('agregarArchivo', () => {
    it('agrega el archivo a una carga abierta y lo anota en la bitacora', async () => {
        const recibido = await recibir('nuevo.csv', 'a,b\n3,4\n');
        await servicio.agregarArchivo(10, recibido, actor);

        expect(await enOriginales()).toHaveLength(1);
        expect(m(repo.insertarArchivo).mock.calls[0]?.[0]).toMatchObject({ cargaId: 10, nombreOriginal: 'nuevo.csv' });
        expect(registrar).toHaveBeenCalledWith(
            expect.objectContaining({ accion: 'carga.archivo_agregar', entidadId: 10 }),
            expect.anything(),
        );
    });

    it('responde 404 si la carga no existe', async () => {
        m(repo.buscarCargaPorId).mockResolvedValue(null);
        const recibido = await recibir('a.csv', 'a,b\n');

        await expect(servicio.agregarArchivo(99, recibido, actor)).rejects.toMatchObject({ statusCode: 404, code: 'CARGA_NO_ENCONTRADA' });
        expect(await enTemporal()).toEqual([]);
    });

    it.each(['rechazada', 'procesada', 'publicada'] as const)('responde 409 si la carga esta %s', async (estado) => {
        m(repo.buscarCargaPorId).mockResolvedValue(cargaBase({ estado }));
        const recibido = await recibir('a.csv', 'a,b\n');

        await expect(servicio.agregarArchivo(10, recibido, actor)).rejects.toMatchObject({ statusCode: 409, code: 'CARGA_NO_EDITABLE' });
        expect(await enOriginales()).toEqual([]);
        expect(await enTemporal()).toEqual([]);
    });
});

describe('rechazarCarga', () => {
    it('rechaza desde recibida o validada, con motivo, y lo anota', async () => {
        await servicio.rechazarCarga(10, 'El archivo esta incompleto', actor);

        expect(repo.transicionarEstado).toHaveBeenCalledWith(
            10,
            ['recibida', 'validada'],
            'rechazada',
            'El archivo esta incompleto',
            expect.anything(),
        );
        expect(registrar).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: 'carga.rechazar',
                detalle: { estadoAnterior: 'recibida', motivo: 'El archivo esta incompleto' },
            }),
            expect.anything(),
        );
    });

    it('404 si no existe y 409 si ya no se puede rechazar', async () => {
        m(repo.buscarCargaPorId).mockResolvedValueOnce(null);
        await expect(servicio.rechazarCarga(99, 'Motivo valido', actor)).rejects.toMatchObject({ statusCode: 404 });

        m(repo.transicionarEstado).mockResolvedValue(false);
        await expect(servicio.rechazarCarga(10, 'Motivo valido', actor)).rejects.toMatchObject({
            statusCode: 409,
            code: 'CARGA_NO_EDITABLE',
        });
        expect(registrar).not.toHaveBeenCalled();
    });
});

describe('actualizarMetadatos', () => {
    it('guarda los metadatos y anota solo los nombres de las claves', async () => {
        await servicio.actualizarMetadatos(10, { metadatos: { cobertura: 'Salinas', secreto: 'valor-largo' } }, actor);

        expect(repo.guardarMetadatos).toHaveBeenCalledWith(10, { cobertura: 'Salinas', secreto: 'valor-largo' }, expect.anything());
        expect(registrar).toHaveBeenCalledWith(
            expect.objectContaining({ accion: 'carga.metadatos', detalle: { campos: ['cobertura', 'secreto'] } }),
            expect.anything(),
        );
    });

    it('404 si no existe y 409 si la carga esta cerrada', async () => {
        m(repo.buscarCargaPorId).mockResolvedValueOnce(null);
        await expect(servicio.actualizarMetadatos(99, { metadatos: { a: '1' } }, actor)).rejects.toMatchObject({ statusCode: 404 });

        m(repo.buscarCargaPorId).mockResolvedValueOnce(cargaBase({ estado: 'publicada' }));
        await expect(servicio.actualizarMetadatos(10, { metadatos: { a: '1' } }, actor)).rejects.toMatchObject({ statusCode: 409 });
        expect(repo.guardarMetadatos).not.toHaveBeenCalled();
    });
});

describe('consultas', () => {
    it('obtenerCarga junta la carga, sus archivos y sus metadatos; 404 si no existe', async () => {
        m(repo.listarMetadatos).mockResolvedValue([{ clave: 'a', valor: '1' }]);
        const detalle = await servicio.obtenerCarga(10);
        expect(detalle.metadatos).toEqual([{ clave: 'a', valor: '1' }]);

        m(repo.buscarCargaPorId).mockResolvedValue(null);
        await expect(servicio.obtenerCarga(99)).rejects.toMatchObject({ statusCode: 404, code: 'CARGA_NO_ENCONTRADA' });
    });

    it('listarCargas pasa solo los filtros que vienen', async () => {
        m(repo.listarCargas).mockResolvedValue({ cargas: [], total: 0 });
        await servicio.listarCargas({ limite: 50, pagina: 1 });
        await servicio.listarCargas({ fuenteId: 3, estado: 'recibida', limite: 10, pagina: 2 });

        expect(m(repo.listarCargas).mock.calls[0]?.[0]).toEqual({ limite: 50, pagina: 1 });
        expect(m(repo.listarCargas).mock.calls[1]?.[0]).toEqual({ fuenteId: 3, estado: 'recibida', limite: 10, pagina: 2 });
    });
});

describe('prepararDescarga', () => {
    const archivoBd = (cambios: object = {}) => ({
        id: 55,
        cargaId: 10,
        nombreOriginal: 'santa_elena.csv',
        nombreAlmacenado: 'aaaa.csv',
        tipoMime: 'text/csv',
        tamanoBytes: 8,
        sha256: 'a'.repeat(64),
        version: 1,
        vigente: true,
        subidoPor: 7,
        creadoEn: new Date(),
        ...cambios,
    });

    it('entrega la ruta dentro de originales y deja constancia', async () => {
        await writeFile(path.join(carpetas.originales, 'aaaa.csv'), 'a,b\n');
        m(repo.buscarArchivo).mockResolvedValue(archivoBd());

        const descarga = await servicio.prepararDescarga(10, 55, actor);

        expect(descarga).toEqual({
            ruta: path.join(carpetas.originales, 'aaaa.csv'),
            nombreOriginal: 'santa_elena.csv',
            tipoMime: 'text/csv',
            tamanoBytes: 8,
        });
        expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ accion: 'carga.descargar', entidadId: 10 }));
    });

    it('404 si la carga o el archivo no existen', async () => {
        m(repo.buscarCargaPorId).mockResolvedValueOnce(null);
        await expect(servicio.prepararDescarga(99, 55, actor)).rejects.toMatchObject({ code: 'CARGA_NO_ENCONTRADA' });

        m(repo.buscarArchivo).mockResolvedValue(null);
        await expect(servicio.prepararDescarga(10, 55, actor)).rejects.toMatchObject({ statusCode: 404, code: 'ARCHIVO_NO_ENCONTRADO' });
    });

    it('404 si el registro existe pero el archivo ya no esta en disco, sin anotar descarga', async () => {
        m(repo.buscarArchivo).mockResolvedValue(archivoBd());
        await expect(servicio.prepararDescarga(10, 55, actor)).rejects.toMatchObject({ statusCode: 404, code: 'ARCHIVO_NO_DISPONIBLE' });
        expect(registrar).not.toHaveBeenCalled();
    });

    it('nunca sale de la carpeta de originales, aunque la base tuviera un nombre manipulado', async () => {
        m(repo.buscarArchivo).mockResolvedValue(archivoBd({ nombreAlmacenado: '../../etc/passwd' }));
        await expect(servicio.prepararDescarga(10, 55, actor)).rejects.toThrow('Ruta fuera de la carpeta permitida');
    });
});