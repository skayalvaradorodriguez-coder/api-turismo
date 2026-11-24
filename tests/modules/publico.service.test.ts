import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/cargas/cargas.repository', () => ({ buscarCargaPorId: vi.fn(), listarCargas: vi.fn() }));
vi.mock('../../src/modules/fuentes/fuentes.repository', () => ({ buscarPorId: vi.fn() }));
vi.mock('../../src/modules/indicadores/indicadores.repository', () => ({ estructuraDelUltimoProcesamiento: vi.fn() }));
vi.mock('../../src/modules/indicadores/indicadores.service', () => ({ indicadoresDeCarga: vi.fn() }));

import * as cargas from '../../src/modules/cargas/cargas.repository';
import * as fuentes from '../../src/modules/fuentes/fuentes.repository';
import * as indicadoresRepo from '../../src/modules/indicadores/indicadores.repository';
import { indicadoresDeCarga } from '../../src/modules/indicadores/indicadores.service';
import { indicadoresPublicados, listarCargasPublicadas } from '../../src/modules/publico/publico.service';

const fecha = new Date('2026-11-24T14:00:00.000Z');
const carga = (id: number, estado = 'publicada') => ({
    id, fuenteId: 3, estado, periodoDesde: '2026-10-30', periodoHasta: '2026-11-04', publicadaEn: fecha,
    publicadaPor: 1, cargadoPor: 2, descripcion: 'nota interna',
});
const fuente = {
    id: 3, nombre: 'Observatorio Turístico UPSE', institucion: 'UPSE', procedencia: 'Encuestas OTS', licenciaUso: 'Uso académico',
    responsable: 'Nombre Apellido', creadoPor: 1,
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fuentes.buscarPorId).mockResolvedValue(fuente as never);
});

describe('listarCargasPublicadas', () => {
    it('pide solo cargas publicadas y entrega únicamente campos públicos', async () => {
        vi.mocked(cargas.listarCargas).mockResolvedValue({ cargas: [carga(7), carga(8)] as never, total: 2 });
        vi.mocked(indicadoresRepo.estructuraDelUltimoProcesamiento).mockResolvedValue('ots_turista_v1');

        const r = await listarCargasPublicadas();

        expect(vi.mocked(cargas.listarCargas).mock.calls[0]?.[0]).toMatchObject({ estado: 'publicada' });
        expect(r).toHaveLength(2);
        expect(r[0]).toEqual({
            id: 7,
            tipoDatos: 'ots_turista_v1',
            fuente: { nombre: 'Observatorio Turístico UPSE', institucion: 'UPSE', procedencia: 'Encuestas OTS', licenciaUso: 'Uso académico' },
            periodoDesde: '2026-10-30',
            periodoHasta: '2026-11-04',
            publicadaEn: '2026-11-24T14:00:00.000Z',
        });
        const texto = JSON.stringify(r);
        expect(texto).not.toContain('Nombre Apellido'); // responsable
        expect(texto).not.toContain('nota interna'); // descripcion interna
        expect(texto).not.toContain('publicadaPor');
    });

    it('pide cada fuente una sola vez aunque varias cargas sean de ella', async () => {
        vi.mocked(cargas.listarCargas).mockResolvedValue({ cargas: [carga(7), carga(8)] as never, total: 2 });
        await listarCargasPublicadas();
        expect(fuentes.buscarPorId).toHaveBeenCalledTimes(1);
    });

    it('sin cargas publicadas devuelve una lista vacía', async () => {
        vi.mocked(cargas.listarCargas).mockResolvedValue({ cargas: [], total: 0 });
        expect(await listarCargasPublicadas()).toEqual([]);
    });
});

describe('indicadoresPublicados', () => {
    const calculados = {
        carga: { id: 7, fuente: { id: 3, nombre: 'Observatorio Turístico UPSE', institucion: 'UPSE' }, periodoDesde: '2026-10-30', periodoHasta: '2026-11-04', estado: 'publicada' },
        estructura: 'ots_turista_v1',
        procesamientoId: 21,
        totalRegistros: 2,
        indicadores: [{ id: 'T1', nombre: 'Encuestas procesadas', descripcion: 'x', valor: 2, unidad: 'registros', registrosUsados: 2, registrosExcluidos: 0 }],
    };

    it('una carga que no existe responde 404', async () => {
        vi.mocked(cargas.buscarCargaPorId).mockResolvedValue(null);
        await expect(indicadoresPublicados(7)).rejects.toMatchObject({ statusCode: 404, code: 'CARGA_NO_ENCONTRADA' });
    });

    it.each(['recibida', 'validada', 'procesada', 'rechazada'])('una carga %s responde 404 y ni siquiera calcula', async (estado) => {
        vi.mocked(cargas.buscarCargaPorId).mockResolvedValue(carga(7, estado) as never);
        await expect(indicadoresPublicados(7)).rejects.toMatchObject({ statusCode: 404, code: 'CARGA_NO_ENCONTRADA' });
        expect(indicadoresDeCarga).not.toHaveBeenCalled();
    });

    it('una carga publicada entrega indicadores sin datos internos (ni ids de fuente ni procesamiento)', async () => {
        vi.mocked(cargas.buscarCargaPorId).mockResolvedValue(carga(7) as never);
        vi.mocked(indicadoresDeCarga).mockResolvedValue(calculados as never);

        const r = await indicadoresPublicados(7);

        expect(r).toEqual({
            carga: { id: 7, fuente: { nombre: 'Observatorio Turístico UPSE', institucion: 'UPSE' }, periodoDesde: '2026-10-30', periodoHasta: '2026-11-04', publicadaEn: '2026-11-24T14:00:00.000Z' },
            estructura: 'ots_turista_v1',
            totalRegistros: 2,
            indicadores: calculados.indicadores,
        });
        expect(JSON.stringify(r)).not.toContain('procesamientoId');
    });

    it('si la retiran mientras se calcula, tampoco se entrega', async () => {
        vi.mocked(cargas.buscarCargaPorId).mockResolvedValue(carga(7) as never);
        vi.mocked(indicadoresDeCarga).mockResolvedValue({ ...calculados, carga: { ...calculados.carga, estado: 'procesada' } } as never);
        await expect(indicadoresPublicados(7)).rejects.toMatchObject({ statusCode: 404 });
    });
});
