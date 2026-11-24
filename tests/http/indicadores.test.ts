import request from 'supertest';
import type { Test } from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../src/modules/auth/auth.types';

vi.mock('../../src/modules/auth/auth.service', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../src/modules/auth/auth.service')>();
    const nuevo = (id: number, rol: string): AuthUser => ({ id, nombres: 'Prueba', apellidos: rol, email: `${rol}@example.com`, rol });
    const usuarios: Record<number, AuthUser> = {
        1001: nuevo(1001, 'super_admin'),
        1002: nuevo(1002, 'admin'),
        1003: nuevo(1003, 'investigador'),
        1004: nuevo(1004, 'externo'),
    };
    return { ...original, usuarioDeSesion: vi.fn(async (id: number) => usuarios[id] ?? null) };
});

vi.mock('../../src/modules/indicadores/indicadores.service', () => ({ indicadoresDeCarga: vi.fn() }));

import { app } from '../../src/app';
import * as servicio from '../../src/modules/indicadores/indicadores.service';
import { AppError } from '../../src/utils/AppError';
import { firmarSesion } from '../../src/utils/token';

const URL = '/api/v1/cargas/10/indicadores';
const como = (peticion: Test, id?: number): Test => (id ? peticion.set('Cookie', `wt_session=${firmarSesion(id)}`) : peticion);

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(servicio.indicadoresDeCarga).mockResolvedValue({ totalRegistros: 0, indicadores: [] } as never);
});

describe('GET /cargas/:id/indicadores', () => {
    it('sin sesion 401 y un usuario externo 403', async () => {
        expect((await request(app).get(URL)).status).toBe(401);
        expect((await como(request(app).get(URL), 1004)).status).toBe(403);
        expect(servicio.indicadoresDeCarga).not.toHaveBeenCalled();
    });

    it.each([1001, 1002, 1003])('el usuario %i puede consultar', async (usuario) => {
        const res = await como(request(app).get(URL), usuario);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, data: { totalRegistros: 0, indicadores: [] } });
        expect(servicio.indicadoresDeCarga).toHaveBeenCalledWith(10);
    });

    it('un id invalido responde 422', async () => {
        expect((await como(request(app).get('/api/v1/cargas/x/indicadores'), 1002)).status).toBe(422);
        expect(servicio.indicadoresDeCarga).not.toHaveBeenCalled();
    });

    it('una carga sin procesar responde 409 con su codigo', async () => {
        vi.mocked(servicio.indicadoresDeCarga).mockRejectedValue(new AppError('sin procesar', 409, 'CARGA_SIN_PROCESAR'));
        const res = await como(request(app).get(URL), 1002);
        expect(res.status).toBe(409);
        expect(res.body.error?.code ?? res.body.code).toBe('CARGA_SIN_PROCESAR');
    });
});
