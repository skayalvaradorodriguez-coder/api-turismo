import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    return { ...original, buscarCargaPorId: vi.fn(), listarArchivos: vi.fn(), transicionarEstado: vi.fn() };
});
vi.mock('../../src/modules/procesamiento/procesamiento.repository', () => ({
    crearProcesamiento: vi.fn(),
    finalizarProcesamiento: vi.fn(),
    buscarProcesamiento: vi.fn(),
    listarProcesamientos: vi.fn(),
    existeProcesamientoCompletado: vi.fn(),
    insertarHallazgos: vi.fn(),
    listarHallazgos: vi.fn(),
    resumirHallazgos: vi.fn(),
    insertarRegistros: vi.fn(),
    listarRegistros: vi.fn(),
}));

import { registrar } from '../../src/modules/auditoria/auditoria.service';
import * as cargasRepo from '../../src/modules/cargas/cargas.repository';
import type { ArchivoOriginal, Carga } from '../../src/modules/cargas/cargas.repository';
import * as fuentes from '../../src/modules/fuentes/fuentes.repository';
import * as repo from '../../src/modules/procesamiento/procesamiento.repository';
import type { Procesamiento } from '../../src/modules/procesamiento/procesamiento.repository';
import * as servicio from '../../src/modules/procesamiento/procesamiento.service';

const actor = { id: 7, ip: '10.0.0.5' };
const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;

const ENCABEZADO =
    'RUC,Nombre Comercial,Número de Registro,Actividad / Modalidad,Clasificación,Categoría,Razón social (Propietario),Provincia,Cantón,Parroquia,Estado Registro del Establecimiento';
const fila = (registro: string, provincia = 'SANTA ELENA', nombre = 'HOSTERIA EL SOL') =>
    `0100090174001,${nombre},${registro},ALOJAMIENTO,HOSTERÍA,3 Estrellas,PEREZ JUAN,${provincia},SANTA ELENA,COLONCHE,RATIFICADO`;
const CSV_VALIDO = [ENCABEZADO, fila('0100090174001.001.1000001', 'SANTA ELENA', 'UNO'), fila('0100090174001.001.1000002', 'SANTA ELENA', 'DOS')].join('\n');
const CSV_CON_ERROR = [ENCABEZADO, fila('0100090174001.001.1000001', 'GUAYAS')].join('\n');

const cargaBase = (cambios: Partial<Carga> = {}): Carga => ({
    id: 10, fuenteId: 1, estructuraId: null, descripcion: null, periodoDesde: null, periodoHasta: null, nivelIngreso: 1,
    estado: 'recibida', motivoRechazo: null, cargadoPor: 7, publicadaPor: null, publicadaEn: null, creadaEn: new Date(), actualizadaEn: new Date(),
    ...cambios,
});
const archivoBase = (cambios: Partial<ArchivoOriginal> = {}): ArchivoOriginal => ({
    id: 55, cargaId: 10, nombreOriginal: 'santa_elena.csv', nombreAlmacenado: 'abc.csv', tipoMime: 'text/csv', tamanoBytes: 1000,
    sha256: 'a'.repeat(64), version: 1, vigente: true, subidoPor: 7, creadoEn: new Date(), ...cambios,
});
const procBase = (cambios: Partial<Procesamiento> = {}): Procesamiento => ({
    id: 90, cargaId: 10, archivoId: 55, tipo: 'validacion', estado: 'completado', totalFilas: 2, totalErrores: 0, totalAlertas: 0,
    mensajeError: null, ejecutadoPor: 7, iniciadoEn: new Date(), finalizadoEn: new Date(), ...cambios,
});

const escribirOriginal = (contenido: string | Buffer) => writeFile(path.join(carpetas.originales, 'abc.csv'), contenido);
const llamadas = (f: unknown) => (f as ReturnType<typeof vi.fn>).mock.calls;
const accionesRegistradas = () => llamadas(registrar).map((c) => (c[0] as { accion: string }).accion);

beforeAll(async () => {
    carpetas.raiz = await mkdtemp(path.join(tmpdir(), 'proc-svc-'));
    carpetas.originales = path.join(carpetas.raiz, 'originales');
});
afterAll(async () => {
    await rm(carpetas.raiz, { recursive: true, force: true });
});

beforeEach(async () => {
    vi.resetAllMocks();
    await rm(carpetas.originales, { recursive: true, force: true });
    await mkdir(carpetas.originales, { recursive: true });
    await escribirOriginal(CSV_VALIDO);

    m(fuentes.buscarPorId).mockResolvedValue({ id: 1, estado: 'activa', codigo: servicio.CODIGO_FUENTE_CATASTRO });
    m(cargasRepo.buscarCargaPorId).mockResolvedValue(cargaBase());
    m(cargasRepo.listarArchivos).mockResolvedValue([archivoBase()]);
    m(cargasRepo.transicionarEstado).mockResolvedValue(true);
    m(repo.crearProcesamiento).mockResolvedValue(91);
    m(repo.finalizarProcesamiento).mockResolvedValue(true);
    m(repo.buscarProcesamiento).mockResolvedValue(procBase({ id: 91 }));
    m(repo.resumirHallazgos).mockResolvedValue([]);
    m(repo.listarProcesamientos).mockResolvedValue([procBase()]);
    m(repo.existeProcesamientoCompletado).mockResolvedValue(false);
});

describe('validarCarga', () => {
    it('sin errores: anota la validacion, pasa la carga a validada y lo deja en la bitacora', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValueOnce(cargaBase()).mockResolvedValueOnce(cargaBase()).mockResolvedValue(cargaBase({ estado: 'validada' }));

        const r = await servicio.validarCarga(10, actor);

        expect(r.estadoCarga).toBe('validada');
        expect(r.procesamiento.id).toBe(91);
        expect(llamadas(repo.crearProcesamiento)[0]?.[0]).toEqual({ cargaId: 10, archivoId: 55, tipo: 'validacion', ejecutadoPor: 7 });
        expect(llamadas(repo.finalizarProcesamiento)[0]?.slice(0, 2)).toEqual([91, { estado: 'completado', totalFilas: 2, totalErrores: 0, totalAlertas: 0 }]);
        expect(llamadas(cargasRepo.transicionarEstado)[0]?.slice(0, 4)).toEqual([10, ['recibida'], 'validada', null]);
        expect(llamadas(registrar)[0]?.[0]).toMatchObject({
            usuarioId: 7, accion: 'procesamiento.validar', entidad: 'carga', entidadId: 10, ip: '10.0.0.5',
            detalle: { procesamientoId: 91, archivoId: 55, totalFilas: 2, totalErrores: 0, estadoCarga: 'validada' },
        });
    });

    it('con errores: guarda los hallazgos y la carga sigue recibida', async () => {
        await escribirOriginal(CSV_CON_ERROR);
        const r = await servicio.validarCarga(10, actor);

        expect(r.procesamiento).toBeDefined();
        expect(m(cargasRepo.transicionarEstado)).not.toHaveBeenCalled();
        const guardados = llamadas(repo.insertarHallazgos)[0]?.[1] as Array<{ regla: string; severidad: string }>;
        expect(guardados.some((h) => h.regla === 'provincia_distinta' && h.severidad === 'error')).toBe(true);
        expect(llamadas(registrar)[0]?.[0]).toMatchObject({ detalle: { totalErrores: 1, estadoCarga: 'recibida' } });
        expect(llamadas(repo.finalizarProcesamiento)[0]?.[1]).toMatchObject({ estado: 'completado', totalErrores: 1 });
    });

    it('con errores y la carga ya validada: vuelve a recibida para no dejar un estado falso', async () => {
        await escribirOriginal(CSV_CON_ERROR);
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(cargaBase({ estado: 'validada' }));

        await servicio.validarCarga(10, actor);

        expect(llamadas(cargasRepo.transicionarEstado)[0]?.slice(0, 4)).toEqual([10, ['validada'], 'recibida', null]);
        expect(llamadas(registrar)[0]?.[0]).toMatchObject({ detalle: { estadoCarga: 'recibida' } });
    });

    it('sin errores y la carga ya validada: no cambia el estado', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(cargaBase({ estado: 'validada' }));
        await servicio.validarCarga(10, actor);
        expect(m(cargasRepo.transicionarEstado)).not.toHaveBeenCalled();
    });

    it('una carga que no existe responde 404 y no escribe nada', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(null);
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ statusCode: 404, code: 'CARGA_NO_ENCONTRADA' });
        expect(m(repo.crearProcesamiento)).not.toHaveBeenCalled();
    });

    it.each(['procesada', 'publicada', 'rechazada'] as const)('una carga %s no se puede validar (409)', async (estado) => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(cargaBase({ estado }));
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ statusCode: 409, code: 'CARGA_NO_VALIDABLE' });
        expect(m(repo.crearProcesamiento)).not.toHaveBeenCalled();
    });

    it('una fuente sin procesamiento disponible responde 422', async () => {
        m(fuentes.buscarPorId).mockResolvedValue({ id: 1, estado: 'activa', codigo: 'observatorio_upse' });
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ statusCode: 422, code: 'FUENTE_SIN_PROCESADOR' });

        m(fuentes.buscarPorId).mockResolvedValue(null);
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ code: 'FUENTE_SIN_PROCESADOR' });
    });

    it('exige exactamente un archivo vigente, en CSV y de tamano razonable', async () => {
        m(cargasRepo.listarArchivos).mockResolvedValue([]);
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ code: 'SIN_ARCHIVO' });

        m(cargasRepo.listarArchivos).mockResolvedValue([archivoBase(), archivoBase({ id: 56, nombreOriginal: 'otro.csv' })]);
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ code: 'VARIOS_ARCHIVOS' });

        m(cargasRepo.listarArchivos).mockResolvedValue([archivoBase({ id: 56, vigente: false }), archivoBase()]);
        await expect(servicio.validarCarga(10, actor)).resolves.toBeDefined(); // los no vigentes se ignoran

        m(cargasRepo.listarArchivos).mockResolvedValue([archivoBase({ nombreOriginal: 'catastro.xlsx' })]);
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ statusCode: 422, code: 'FORMATO_NO_SOPORTADO' });

        m(cargasRepo.listarArchivos).mockResolvedValue([archivoBase({ tamanoBytes: 60 * 1024 * 1024 })]);
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ code: 'ARCHIVO_MUY_GRANDE_PARA_PROCESAR' });
    });

    it('si el original no esta en el almacenamiento responde 404', async () => {
        await rm(path.join(carpetas.originales, 'abc.csv'));
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ statusCode: 404, code: 'ARCHIVO_NO_DISPONIBLE' });
    });

    it('un archivo que no esta en UTF-8 se rechaza con un mensaje claro', async () => {
        await escribirOriginal(Buffer.from(`${ENCABEZADO}\n0100090174001,HOSTER\xcdA,x`, 'latin1'));
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ statusCode: 422, code: 'CODIFICACION_INVALIDA' });
    });

    it('si el archivo vigente cambia durante la validacion, responde 409 y no deja nada', async () => {
        m(cargasRepo.listarArchivos).mockResolvedValueOnce([archivoBase()]).mockResolvedValue([archivoBase({ id: 99 })]);
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ statusCode: 409, code: 'CARGA_CAMBIO' });
        expect(m(repo.crearProcesamiento)).not.toHaveBeenCalled();
    });

    it('si otra persona cambia el estado a la vez (comprobar y cambiar falla), responde 409', async () => {
        m(cargasRepo.transicionarEstado).mockResolvedValue(false);
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ statusCode: 409, code: 'CARGA_CAMBIO' });
        expect(accionesRegistradas()).not.toContain('procesamiento.validar');
    });

    it('un fallo inesperado se relanza y deja constancia de la ejecucion fallida', async () => {
        m(repo.insertarHallazgos).mockRejectedValueOnce(new Error('se cayo la base'));

        await expect(servicio.validarCarga(10, actor)).rejects.toThrow('se cayo la base');

        const cierres = llamadas(repo.finalizarProcesamiento);
        expect(cierres[cierres.length - 1]?.[1]).toMatchObject({ estado: 'fallido', mensajeError: 'Error interno durante el proceso' });
        expect(accionesRegistradas()).toContain('procesamiento.fallo');
        expect(JSON.stringify(cierres)).not.toContain('se cayo la base'); // el detalle interno no se guarda ni se muestra
    });

    it('un error de reglas del negocio no se anota como fallo', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(null);
        await expect(servicio.validarCarga(10, actor)).rejects.toMatchObject({ statusCode: 404 });
        expect(accionesRegistradas()).not.toContain('procesamiento.fallo');
    });
});

describe('procesarCarga', () => {
    beforeEach(() => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(cargaBase({ estado: 'validada' }));
    });

    it('guarda los registros, pasa la carga a procesada y lo deja en la bitacora', async () => {
        m(cargasRepo.buscarCargaPorId)
            .mockResolvedValueOnce(cargaBase({ estado: 'validada' }))
            .mockResolvedValueOnce(cargaBase({ estado: 'validada' }))
            .mockResolvedValue(cargaBase({ estado: 'procesada' }));

        const r = await servicio.procesarCarga(10, actor);

        expect(r.estadoCarga).toBe('procesada');
        expect(llamadas(cargasRepo.transicionarEstado)[0]?.slice(0, 4)).toEqual([10, ['validada'], 'procesada', null]);
        expect(llamadas(repo.crearProcesamiento)[0]?.[0]).toEqual({ cargaId: 10, archivoId: 55, tipo: 'procesamiento', ejecutadoPor: 7 });

        const [cargaId, archivoId, registros] = llamadas(repo.insertarRegistros)[0] as [number, number, Array<{ numeroRegistro: string }>];
        expect([cargaId, archivoId, registros.map((x) => x.numeroRegistro)]).toEqual([10, 55, ['0100090174001.001.1000001', '0100090174001.001.1000002']]);
        expect(llamadas(repo.finalizarProcesamiento)[0]?.[1]).toEqual({ estado: 'completado', totalFilas: 2, totalErrores: 0, totalAlertas: 0 });
        expect(llamadas(registrar)[0]?.[0]).toMatchObject({
            usuarioId: 7, accion: 'procesamiento.procesar', entidad: 'carga', entidadId: 10,
            detalle: { procesamientoId: 91, archivoId: 55, totalFilas: 2, registrosGuardados: 2 },
        });
    });

    it('cambia el estado ANTES de guardar los registros (asi solo una persona gana)', async () => {
        await servicio.procesarCarga(10, actor);
        const orden = (f: unknown) => (f as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0] as number;
        expect(orden(cargasRepo.transicionarEstado)).toBeLessThan(orden(repo.insertarRegistros));
    });

    it.each(['recibida', 'procesada', 'publicada', 'rechazada'] as const)('una carga %s no se puede procesar (409)', async (estado) => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(cargaBase({ estado }));
        await expect(servicio.procesarCarga(10, actor)).rejects.toMatchObject({ statusCode: 409, code: 'CARGA_NO_PROCESABLE' });
        expect(m(repo.insertarRegistros)).not.toHaveBeenCalled();
    });

    it('sin una validacion limpia del mismo archivo, pide validar otra vez', async () => {
        m(repo.listarProcesamientos).mockResolvedValue([]);
        await expect(servicio.procesarCarga(10, actor)).rejects.toMatchObject({ statusCode: 409, code: 'VALIDACION_DESACTUALIZADA' });

        m(repo.listarProcesamientos).mockResolvedValue([procBase({ archivoId: 12 })]); // se valido otro archivo
        await expect(servicio.procesarCarga(10, actor)).rejects.toMatchObject({ code: 'VALIDACION_DESACTUALIZADA' });

        m(repo.listarProcesamientos).mockResolvedValue([procBase({ totalErrores: 3 })]);
        await expect(servicio.procesarCarga(10, actor)).rejects.toMatchObject({ code: 'VALIDACION_DESACTUALIZADA' });

        m(repo.listarProcesamientos).mockResolvedValue([procBase({ estado: 'fallido' }), procBase({ tipo: 'procesamiento' })]);
        await expect(servicio.procesarCarga(10, actor)).rejects.toMatchObject({ code: 'VALIDACION_DESACTUALIZADA' });
        expect(m(repo.insertarRegistros)).not.toHaveBeenCalled();
    });

    it('si el archivo tiene errores no guarda nada', async () => {
        await escribirOriginal(CSV_CON_ERROR);
        await expect(servicio.procesarCarga(10, actor)).rejects.toMatchObject({ statusCode: 409, code: 'ARCHIVO_CON_ERRORES' });
        expect(m(repo.insertarRegistros)).not.toHaveBeenCalled();
    });

    it('una carga ya procesada antes responde 409 sin cambiar el estado', async () => {
        m(repo.existeProcesamientoCompletado).mockResolvedValue(true);
        await expect(servicio.procesarCarga(10, actor)).rejects.toMatchObject({ statusCode: 409, code: 'CARGA_YA_PROCESADA' });
        expect(m(cargasRepo.transicionarEstado)).not.toHaveBeenCalled();
    });

    it('si otra persona la proceso a la vez (comprobar y cambiar falla), responde 409 y no guarda', async () => {
        m(cargasRepo.transicionarEstado).mockResolvedValue(false);
        await expect(servicio.procesarCarga(10, actor)).rejects.toMatchObject({ statusCode: 409, code: 'CARGA_NO_PROCESABLE' });
        expect(m(repo.insertarRegistros)).not.toHaveBeenCalled();
    });

    it('un registro repetido en la base se informa como carga ya procesada', async () => {
        m(repo.insertarRegistros).mockRejectedValue({ code: 'ER_DUP_ENTRY', message: "Duplicate entry 'x' for key 'uq_catastro_carga_registro'" });
        await expect(servicio.procesarCarga(10, actor)).rejects.toMatchObject({ statusCode: 409, code: 'CARGA_YA_PROCESADA' });
        expect(accionesRegistradas()).not.toContain('procesamiento.procesar');
    });

    it('un fallo inesperado se relanza y deja constancia de la ejecucion fallida', async () => {
        m(repo.insertarRegistros).mockRejectedValueOnce(new Error('se cayo la base'));
        await expect(servicio.procesarCarga(10, actor)).rejects.toThrow('se cayo la base');
        expect(accionesRegistradas()).toEqual(['procesamiento.fallo']);
        expect(llamadas(repo.crearProcesamiento)[1]?.[0]).toMatchObject({ tipo: 'procesamiento' });
    });
});

describe('consultas', () => {
    it('listarProcesamientosDeCarga responde 404 si la carga no existe', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(null);
        await expect(servicio.listarProcesamientosDeCarga(10)).rejects.toMatchObject({ statusCode: 404, code: 'CARGA_NO_ENCONTRADA' });

        m(cargasRepo.buscarCargaPorId).mockResolvedValue(cargaBase());
        expect(await servicio.listarProcesamientosDeCarga(10)).toHaveLength(1);
    });

    it('obtenerHallazgos solo encuentra procesamientos de esa carga y agrega el resumen', async () => {
        m(repo.buscarProcesamiento).mockResolvedValue(procBase({ cargaId: 99 }));
        await expect(servicio.obtenerHallazgos(10, 90, { limite: 50, pagina: 1 })).rejects.toMatchObject({ statusCode: 404, code: 'PROCESAMIENTO_NO_ENCONTRADO' });

        m(repo.buscarProcesamiento).mockResolvedValue(null);
        await expect(servicio.obtenerHallazgos(10, 90, { limite: 50, pagina: 1 })).rejects.toMatchObject({ code: 'PROCESAMIENTO_NO_ENCONTRADO' });

        m(repo.buscarProcesamiento).mockResolvedValue(procBase());
        m(repo.listarHallazgos).mockResolvedValue({ hallazgos: [], total: 0 });
        m(repo.resumirHallazgos).mockResolvedValue([{ regla: 'nombre_vacio', severidad: 'alerta', total: 6 }]);
        expect(await servicio.obtenerHallazgos(10, 90, { severidad: 'alerta', limite: 50, pagina: 1 })).toEqual({
            hallazgos: [], total: 0, resumen: [{ regla: 'nombre_vacio', severidad: 'alerta', total: 6 }],
        });
        expect(llamadas(repo.listarHallazgos)[0]?.slice(0, 2)).toEqual([90, { severidad: 'alerta', limite: 50, pagina: 1 }]);
    });

    it('obtenerRegistros sin datos sensibles no escribe en la bitacora', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(cargaBase());
        m(repo.listarRegistros).mockResolvedValue({ registros: [], total: 0 });

        await servicio.obtenerRegistros(10, { limite: 50, pagina: 1 }, false, actor);

        expect(llamadas(repo.listarRegistros)[0]?.slice(0, 3)).toEqual([10, { limite: 50, pagina: 1 }, false]);
        expect(m(registrar)).not.toHaveBeenCalled();
    });

    it('obtenerRegistros con datos sensibles deja constancia de quien los vio', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(cargaBase());
        m(repo.listarRegistros).mockResolvedValue({ registros: [], total: 0 });

        await servicio.obtenerRegistros(10, { limite: 20, pagina: 3 }, true, actor);

        expect(llamadas(repo.listarRegistros)[0]?.[2]).toBe(true);
        expect(llamadas(registrar)[0]?.[0]).toMatchObject({
            usuarioId: 7, accion: 'procesamiento.ver_datos_sensibles', entidad: 'carga', entidadId: 10, ip: '10.0.0.5',
            detalle: { pagina: 3, limite: 20, devueltos: 0 },
        });
    });

    it('obtenerRegistros responde 404 si la carga no existe', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(null);
        await expect(servicio.obtenerRegistros(10, { limite: 50, pagina: 1 }, false, actor)).rejects.toMatchObject({ statusCode: 404 });
    });
});
