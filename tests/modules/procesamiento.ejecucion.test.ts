import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:fs/promises')>()), access: vi.fn(async () => undefined) }));
vi.mock('../../src/config/storage', () => ({ RAIZ_ORIGINALES: '/almacen/originales' }));
vi.mock('../../src/utils/transaccion', () => ({
    enTransaccion: (trabajo: (conexion: unknown) => Promise<unknown>) => trabajo({ conexion: 'falsa' }),
}));
vi.mock('../../src/modules/auditoria/auditoria.service', () => ({ registrar: vi.fn() }));
vi.mock('../../src/modules/cargas/cargas.repository', () => ({ buscarCargaPorId: vi.fn(), buscarArchivo: vi.fn(), transicionarEstado: vi.fn() }));
vi.mock('../../src/modules/procesamiento/procesamiento.cliente', () => ({ consultarServicio: vi.fn() }));
vi.mock('../../src/modules/procesamiento/procesamiento.repository', () => ({
    crearProcesamiento: vi.fn(),
    finalizarProcesamiento: vi.fn(),
    buscarProcesamiento: vi.fn(),
    insertarHallazgos: vi.fn(),
    insertarRegistros: vi.fn(),
}));

import * as access from 'node:fs/promises';
import { registrar } from '../../src/modules/auditoria/auditoria.service';
import * as cargasRepo from '../../src/modules/cargas/cargas.repository';
import * as cliente from '../../src/modules/procesamiento/procesamiento.cliente';
import * as repo from '../../src/modules/procesamiento/procesamiento.repository';
import * as servicio from '../../src/modules/procesamiento/procesamiento.service';

// La ruta se arma con el separador del sistema (en Windows usa \\)
const RUTA_ARCHIVO = path.resolve('/almacen/originales', 'abc.csv');
const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
const actor = { id: 7, ip: '10.0.0.5' };
const respuesta = (c: Record<string, unknown> = {}) => ({
    estructura: { codigo: 'ots_turista_v1', nombre: 'n' },
    formato: 'csv',
    hoja: null,
    resumen: { filas_leidas: 2, filas_validas: 2, filas_excluidas: 0, errores: 0, alertas: 1 },
    hallazgos: [{ fila: null, columna: 'uuid_kobo', regla: 'columna_vacia', severidad: 'alerta', mensaje: 'm', valor_original: null, valor_corregido: null }],
    hallazgos_truncados: false,
    cambios: [{ fila: 2, columna: 'edad', regla: 'cero_a_faltante', valor_original: '0', valor_nuevo: null }],
    cambios_truncados: false,
    alertas_normalizacion: [],
    registros: [{ fila_origen: 2, identificador: '1', datos: { edad: null } }, { fila_origen: 3, identificador: '2', datos: { edad: 29 } }],
    ...c,
});

beforeEach(() => {
    vi.resetAllMocks();
    m(access.access).mockResolvedValue(undefined);
    m(cargasRepo.buscarCargaPorId).mockResolvedValue({ id: 10, estado: 'validada' });
    m(cargasRepo.buscarArchivo).mockResolvedValue({ id: 55, cargaId: 10, nombreOriginal: 'a.csv', nombreAlmacenado: 'abc.csv', vigente: true });
    m(cargasRepo.transicionarEstado).mockResolvedValue(true);
    m(repo.crearProcesamiento).mockResolvedValue(90);
    m(repo.finalizarProcesamiento).mockResolvedValue(true);
    m(repo.buscarProcesamiento).mockResolvedValue({ id: 90, estado: 'completado' });
    m(cliente.consultarServicio).mockResolvedValue(respuesta());
});

describe('ejecutarProcesamiento: comprobaciones previas', () => {
    it('la carga debe existir; el archivo, ser de esa carga y estar vigente', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(null);
        await expect(servicio.ejecutarProcesamiento(10, { tipo: 'validacion', archivoId: 55 }, actor)).rejects.toMatchObject({ statusCode: 404, code: 'CARGA_NO_ENCONTRADA' });

        m(cargasRepo.buscarCargaPorId).mockResolvedValue({ id: 10, estado: 'recibida' });
        m(cargasRepo.buscarArchivo).mockResolvedValue(null);
        await expect(servicio.ejecutarProcesamiento(10, { tipo: 'validacion', archivoId: 55 }, actor)).rejects.toMatchObject({ code: 'ARCHIVO_NO_ENCONTRADO' });

        m(cargasRepo.buscarArchivo).mockResolvedValue({ id: 55, vigente: false, nombreAlmacenado: 'a.csv' });
        await expect(servicio.ejecutarProcesamiento(10, { tipo: 'validacion', archivoId: 55 }, actor)).rejects.toMatchObject({ statusCode: 409, code: 'ARCHIVO_NO_VIGENTE' });
        expect(repo.crearProcesamiento).not.toHaveBeenCalled();
    });

    it('procesar exige carga validada; validar no se permite en una carga ya procesada o rechazada', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue({ id: 10, estado: 'recibida' });
        await expect(servicio.ejecutarProcesamiento(10, { tipo: 'procesamiento', archivoId: 55 }, actor)).rejects.toMatchObject({ statusCode: 409, code: 'ESTADO_NO_PERMITE_PROCESAR' });
        for (const estado of ['procesada', 'publicada', 'rechazada']) {
            m(cargasRepo.buscarCargaPorId).mockResolvedValue({ id: 10, estado });
            await expect(servicio.ejecutarProcesamiento(10, { tipo: 'validacion', archivoId: 55 }, actor)).rejects.toMatchObject({ code: 'ESTADO_NO_PERMITE_PROCESAR' });
        }
        expect(cliente.consultarServicio).not.toHaveBeenCalled();
    });

    it('si el archivo no esta en el almacenamiento, 404 y no se registra nada', async () => {
        m(access.access).mockRejectedValue(new Error('ENOENT'));
        await expect(servicio.ejecutarProcesamiento(10, { tipo: 'procesamiento', archivoId: 55 }, actor)).rejects.toMatchObject({ code: 'ARCHIVO_NO_DISPONIBLE' });
        expect(repo.crearProcesamiento).not.toHaveBeenCalled();
    });
});

describe('ejecutarProcesamiento: procesar', () => {
    it('guarda hallazgos, cambios y registros; sube la carga a procesada (nivel 2) y deja bitacora', async () => {
        const r = await servicio.ejecutarProcesamiento(10, { tipo: 'procesamiento', archivoId: 55 }, actor);

        expect(cliente.consultarServicio).toHaveBeenCalledWith('procesar', RUTA_ARCHIVO, 'a.csv');
        const hallazgos = m(repo.insertarHallazgos).mock.calls[0]?.[1] as Array<{ severidad: string }>;
        expect(hallazgos.map((h) => h.severidad)).toEqual(['alerta', 'cambio']);
        const llamada = m(repo.insertarRegistros).mock.calls[0] as unknown[];
        expect(llamada.slice(0, 3)).toEqual([90, 10, 'ots_turista_v1']);
        expect(llamada[3]).toEqual([{ identificador: '1', filaOrigen: 2, datos: { edad: null } }, { identificador: '2', filaOrigen: 3, datos: { edad: 29 } }]);
        expect(m(repo.finalizarProcesamiento).mock.calls[0]?.slice(0, 2)).toEqual([90, { estado: 'completado', totalFilas: 2, totalErrores: 0, totalAlertas: 1, mensajeError: null }]);
        expect(m(cargasRepo.transicionarEstado).mock.calls[0]).toEqual([10, ['validada'], 'procesada', null, { conexion: 'falsa' }, 2]);
        expect(m(registrar).mock.calls[0]?.[0]).toMatchObject({ usuarioId: 7, accion: 'carga.procesar', entidad: 'carga', entidadId: 10, ip: '10.0.0.5' });
        expect(r).toMatchObject({ registrosGuardados: 2, estructura: { codigo: 'ots_turista_v1' }, resumen: { filasLeidas: 2, errores: 0, alertas: 1 } });
    });

    it('estructura no reconocida: el procesamiento queda fallido, no se guardan registros y la carga no avanza', async () => {
        m(cliente.consultarServicio).mockResolvedValue(respuesta({ estructura: null, resumen: { filas_leidas: 2, filas_validas: 2, filas_excluidas: 0, errores: 1, alertas: 0 }, registros: [], cambios: [] }));
        await servicio.ejecutarProcesamiento(10, { tipo: 'procesamiento', archivoId: 55 }, actor);
        expect(repo.insertarRegistros).not.toHaveBeenCalled();
        expect(cargasRepo.transicionarEstado).not.toHaveBeenCalled();
        expect(m(repo.finalizarProcesamiento).mock.calls[0]?.[1]).toMatchObject({ estado: 'fallido', mensajeError: 'La estructura del archivo no se reconoce' });
    });

    it('si el servicio falla, el procesamiento queda fallido y el error llega a quien llamo', async () => {
        m(cliente.consultarServicio).mockRejectedValue(Object.assign(new Error('El servicio de procesamiento no esta disponible'), { statusCode: 502 }));
        await expect(servicio.ejecutarProcesamiento(10, { tipo: 'procesamiento', archivoId: 55 }, actor)).rejects.toMatchObject({ statusCode: 502 });
        expect(m(repo.finalizarProcesamiento).mock.calls[0]?.slice(0, 2)).toEqual([90, { estado: 'fallido', totalFilas: 0, totalErrores: 0, totalAlertas: 0, mensajeError: 'El servicio de procesamiento no esta disponible' }]);
        expect(repo.insertarHallazgos).not.toHaveBeenCalled();
    });

    it('si el estado de la carga cambio mientras tanto, falla y queda registrado como fallido', async () => {
        m(cargasRepo.transicionarEstado).mockResolvedValue(false);
        await expect(servicio.ejecutarProcesamiento(10, { tipo: 'procesamiento', archivoId: 55 }, actor)).rejects.toMatchObject({ statusCode: 409 });
        expect(m(repo.finalizarProcesamiento).mock.calls.at(-1)?.[1]).toMatchObject({ estado: 'fallido' });
    });
});

describe('ejecutarProcesamiento: validar', () => {
    it('no guarda registros; si se reconoce la estructura, la carga pasa a validada', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue({ id: 10, estado: 'recibida' });
        const r = await servicio.ejecutarProcesamiento(10, { tipo: 'validacion', archivoId: 55 }, actor);
        expect(cliente.consultarServicio).toHaveBeenCalledWith('validar', RUTA_ARCHIVO, 'a.csv');
        expect(repo.insertarRegistros).not.toHaveBeenCalled();
        expect(m(cargasRepo.transicionarEstado).mock.calls[0]).toEqual([10, ['recibida', 'validada'], 'validada', null, { conexion: 'falsa' }]);
        expect(m(registrar).mock.calls[0]?.[0]).toMatchObject({ accion: 'carga.validar' });
        expect(r.registrosGuardados).toBe(0);
    });

    it('con estructura desconocida se completa (el hallazgo lo explica) pero la carga no avanza', async () => {
        m(cliente.consultarServicio).mockResolvedValue(respuesta({ estructura: null }));
        await servicio.ejecutarProcesamiento(10, { tipo: 'validacion', archivoId: 55 }, actor);
        expect(cargasRepo.transicionarEstado).not.toHaveBeenCalled();
        expect(m(repo.finalizarProcesamiento).mock.calls[0]?.[1]).toMatchObject({ estado: 'completado' });
    });
});
