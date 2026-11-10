import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/cargas/cargas.repository', () => ({ buscarCargaPorId: vi.fn() }));
vi.mock('../../src/modules/procesamiento/procesamiento.repository', () => ({
    buscarProcesamiento: vi.fn(),
    listarProcesamientos: vi.fn(),
    listarHallazgos: vi.fn(),
    resumirHallazgos: vi.fn(),
}));

import * as cargasRepo from '../../src/modules/cargas/cargas.repository';
import * as repo from '../../src/modules/procesamiento/procesamiento.repository';
import type { Procesamiento } from '../../src/modules/procesamiento/procesamiento.repository';
import * as servicio from '../../src/modules/procesamiento/procesamiento.service';

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
const llamadas = (f: unknown) => (f as ReturnType<typeof vi.fn>).mock.calls;

const procBase = (cambios: Partial<Procesamiento> = {}): Procesamiento => ({
    id: 90, cargaId: 10, archivoId: 55, tipo: 'validacion', estado: 'completado', totalFilas: 2, totalErrores: 0, totalAlertas: 0,
    mensajeError: null, ejecutadoPor: 7, iniciadoEn: new Date(), finalizadoEn: new Date(), ...cambios,
});

beforeEach(() => {
    vi.resetAllMocks();
    m(cargasRepo.buscarCargaPorId).mockResolvedValue({ id: 10 });
    m(repo.listarProcesamientos).mockResolvedValue([procBase()]);
    m(repo.resumirHallazgos).mockResolvedValue([]);
});

describe('consultas de procesamiento', () => {
    it('listarProcesamientosDeCarga responde 404 si la carga no existe', async () => {
        m(cargasRepo.buscarCargaPorId).mockResolvedValue(null);
        await expect(servicio.listarProcesamientosDeCarga(10)).rejects.toMatchObject({ statusCode: 404, code: 'CARGA_NO_ENCONTRADA' });
        expect(repo.listarProcesamientos).not.toHaveBeenCalled();
    });

    it('listarProcesamientosDeCarga devuelve el historial de la carga', async () => {
        expect(await servicio.listarProcesamientosDeCarga(10)).toHaveLength(1);
        expect(llamadas(repo.listarProcesamientos)[0]?.[0]).toBe(10);
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
});
