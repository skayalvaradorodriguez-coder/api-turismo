import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/publico/publico.service', () => ({ listarCargasPublicadas: vi.fn(), indicadoresPublicados: vi.fn() }));

import { app } from '../../src/app';
import * as servicio from '../../src/modules/publico/publico.service';
import { AppError } from '../../src/utils/AppError';

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(servicio.listarCargasPublicadas).mockResolvedValue([]);
    vi.mocked(servicio.indicadoresPublicados).mockResolvedValue({ totalRegistros: 0, indicadores: [] } as never);
});

describe('parte pública (HTTP)', () => {
    it('la lista se puede consultar sin sesión', async () => {
        const res = await request(app).get('/api/v1/publico/cargas');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, data: { cargas: [] } });
    });

    it('los indicadores se pueden consultar sin sesión y se pide la carga indicada', async () => {
        const res = await request(app).get('/api/v1/publico/cargas/10/indicadores');
        expect(res.status).toBe(200);
        expect(servicio.indicadoresPublicados).toHaveBeenCalledWith(10);
    });

    it('un id inválido responde 422 y no llega al servicio', async () => {
        expect((await request(app).get('/api/v1/publico/cargas/x/indicadores')).status).toBe(422);
        expect(servicio.indicadoresPublicados).not.toHaveBeenCalled();
    });

    it('una carga no publicada responde 404 con el código de la API', async () => {
        vi.mocked(servicio.indicadoresPublicados).mockRejectedValue(new AppError('La carga no existe o no esta publicada', 404, 'CARGA_NO_ENCONTRADA'));
        const res = await request(app).get('/api/v1/publico/cargas/10/indicadores');
        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ ok: false, code: 'CARGA_NO_ENCONTRADA' });
    });

    it('es solo lectura: escribir en la parte pública no existe', async () => {
        for (const metodo of ['post', 'put', 'patch', 'delete'] as const) {
            const res = await request(app)[metodo]('/api/v1/publico/cargas');
            expect(res.status, metodo).toBe(404);
        }
    });

    it('limita las peticiones por IP (responde 429 al pasarse)', async () => {
        let ultimo = 200;
        for (let i = 0; i < 70; i++) ultimo = (await request(app).get('/api/v1/publico/cargas')).status;
        expect(ultimo).toBe(429);
    });
});
