import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/cargas/cargas.repository', () => ({ buscarCargaPorId: vi.fn() }));
vi.mock('../../src/modules/fuentes/fuentes.repository', () => ({ buscarPorId: vi.fn() }));
vi.mock('../../src/modules/indicadores/indicadores.repository', () => ({ registrosDelUltimoProcesamiento: vi.fn() }));

import * as cargas from '../../src/modules/cargas/cargas.repository';
import * as fuentes from '../../src/modules/fuentes/fuentes.repository';
import * as repo from '../../src/modules/indicadores/indicadores.repository';
import { indicadoresDeCarga } from '../../src/modules/indicadores/indicadores.service';

const carga = { id: 7, fuenteId: 3, periodoDesde: '2026-10-30', periodoHasta: '2026-11-04', estado: 'procesada' };
const fuente = { id: 3, nombre: 'Observatorio Turístico UPSE', institucion: 'UPSE' };

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(cargas.buscarCargaPorId).mockResolvedValue(carga as never);
    vi.mocked(fuentes.buscarPorId).mockResolvedValue(fuente as never);
});

describe('indicadoresDeCarga', () => {
    it('una carga inexistente responde 404', async () => {
        vi.mocked(cargas.buscarCargaPorId).mockResolvedValue(null);
        await expect(indicadoresDeCarga(7)).rejects.toMatchObject({ statusCode: 404, code: 'CARGA_NO_ENCONTRADA' });
    });

    it('una carga sin procesar responde 409', async () => {
        vi.mocked(repo.registrosDelUltimoProcesamiento).mockResolvedValue(null);
        await expect(indicadoresDeCarga(7)).rejects.toMatchObject({ statusCode: 409, code: 'CARGA_SIN_PROCESAR' });
    });

    it('devuelve fuente, periodo y los indicadores de la estructura', async () => {
        vi.mocked(repo.registrosDelUltimoProcesamiento).mockResolvedValue({
            procesamientoId: 21,
            estructura: 'ots_turista_v1',
            registros: [{ edad: 30 }, { edad: 40 }],
        });
        const r = await indicadoresDeCarga(7);
        expect(r.carga).toEqual({ id: 7, fuente: { id: 3, nombre: 'Observatorio Turístico UPSE', institucion: 'UPSE' }, periodoDesde: '2026-10-30', periodoHasta: '2026-11-04', estado: 'procesada' });
        expect(r.procesamientoId).toBe(21);
        expect(r.totalRegistros).toBe(2);
        expect(r.indicadores.find((i) => i.id === 'T3')?.valor).toBe(35);
        expect(r.indicadores.every((i) => i.id.startsWith('T'))).toBe(true);
    });

    it('una estructura sin indicadores devuelve la lista vacia, sin inventar', async () => {
        vi.mocked(repo.registrosDelUltimoProcesamiento).mockResolvedValue({ procesamientoId: 22, estructura: 'kobo_mayo_agosto_v1', registros: [{}] });
        expect((await indicadoresDeCarga(7)).indicadores).toEqual([]);
    });
});
