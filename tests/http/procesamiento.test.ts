import request from 'supertest';
import type { Test } from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../src/modules/auth/auth.types';

// Usuarios simulados, uno por rol: no hace falta crearlos en la base
vi.mock('../../src/modules/auth/auth.service', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../src/modules/auth/auth.service')>();
    const nuevo = (id: number, rol: string): AuthUser => ({
        id,
        nombres: 'Prueba',
        apellidos: rol,
        email: `${rol}@example.com`,
        rol,
    });
    const usuarios: Record<number, AuthUser> = {
        1001: nuevo(1001, 'super_admin'),
        1002: nuevo(1002, 'admin'),
        1003: nuevo(1003, 'investigador'),
        1004: nuevo(1004, 'externo'),
    };
    return { ...original, usuarioDeSesion: vi.fn(async (id: number) => usuarios[id] ?? null) };
});

// El servicio se simula: estas pruebas revisan la capa HTTP, no la base ni la bitacora
vi.mock('../../src/modules/procesamiento/procesamiento.service', () => ({
    listarProcesamientosDeCarga: vi.fn(),
    obtenerHallazgos: vi.fn(),
    ejecutarProcesamiento: vi.fn(),
}));

import { app } from '../../src/app';
import * as servicio from '../../src/modules/procesamiento/procesamiento.service';
import { firmarSesion } from '../../src/utils/token';

const BASE = '/api/v1/cargas';
const SUPER_ADMIN = 1001;
const ADMIN = 1002;
const INVESTIGADOR = 1003;
const EXTERNO = 1004;

const cookie = (id: number) => `wt_session=${firmarSesion(id)}`;

function como(peticion: Test, usuarioId?: number): Test {
    return usuarioId ? peticion.set('Cookie', cookie(usuarioId)) : peticion;
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(servicio.listarProcesamientosDeCarga).mockResolvedValue([]);
    vi.mocked(servicio.obtenerHallazgos).mockResolvedValue({ hallazgos: [], total: 0, resumen: [] });
    vi.mocked(servicio.ejecutarProcesamiento).mockResolvedValue({ registrosGuardados: 0 } as never);
});

describe('GET /cargas/:id/procesamientos', () => {
    it('sin sesion 401 y un usuario externo 403', async () => {
        expect((await request(app).get(`${BASE}/10/procesamientos`)).status).toBe(401);
        expect((await como(request(app).get(`${BASE}/10/procesamientos`), EXTERNO)).status).toBe(403);
    });

    it.each([SUPER_ADMIN, ADMIN, INVESTIGADOR])('el usuario %i puede consultar', async (usuario) => {
        const res = await como(request(app).get(`${BASE}/10/procesamientos`), usuario);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, data: { procesamientos: [] } });
        expect(servicio.listarProcesamientosDeCarga).toHaveBeenCalledWith(10);
    });
});

describe('GET /cargas/:id/procesamientos/:procesamientoId/hallazgos', () => {
    const url = `${BASE}/10/procesamientos/5/hallazgos`;

    it('exige sesion y rol de consulta', async () => {
        expect((await request(app).get(url)).status).toBe(401);
        expect((await como(request(app).get(url), EXTERNO)).status).toBe(403);
    });

    it('usa valores por defecto y pasa los filtros validados', async () => {
        await como(request(app).get(url), INVESTIGADOR);
        expect(servicio.obtenerHallazgos).toHaveBeenCalledWith(10, 5, { limite: 50, pagina: 1 });

        await como(request(app).get(`${url}?severidad=error&regla=formato_valido&limite=20&pagina=2`), ADMIN);
        expect(servicio.obtenerHallazgos).toHaveBeenLastCalledWith(10, 5, { severidad: 'error', regla: 'formato_valido', limite: 20, pagina: 2 });
    });

    it.each(['severidad=grave', 'regla=A;DROP', 'limite=0', 'limite=201', 'pagina=0', 'pagina=abc'])('el filtro %s responde 422', async (consulta) => {
        const res = await como(request(app).get(`${url}?${consulta}`), ADMIN);
        expect(res.status).toBe(422);
        expect(servicio.obtenerHallazgos).not.toHaveBeenCalled();
    });

    it('un id de procesamiento invalido responde 422', async () => {
        expect((await como(request(app).get(`${BASE}/10/procesamientos/x/hallazgos`), ADMIN)).status).toBe(422);
    });
});

describe('POST /cargas/:id/procesamientos', () => {
    const url = `${BASE}/10/procesamientos`;
    const cuerpo = { tipo: 'procesamiento', archivoId: 55 };

    it('sin sesion 401; investigador y externo 403 (solo administran los administradores)', async () => {
        expect((await request(app).post(url).send(cuerpo)).status).toBe(401);
        expect((await como(request(app).post(url).send(cuerpo), INVESTIGADOR)).status).toBe(403);
        expect((await como(request(app).post(url).send(cuerpo), EXTERNO)).status).toBe(403);
        expect(servicio.ejecutarProcesamiento).not.toHaveBeenCalled();
    });

    it.each([SUPER_ADMIN, ADMIN])('el usuario %i ejecuta y el actor sale de la sesion', async (usuario) => {
        const res = await como(request(app).post(url).send({ ...cuerpo, ejecutadoPor: 999 }), usuario);
        expect(res.status).toBe(201);
        expect(res.body).toEqual({ ok: true, data: { registrosGuardados: 0 } });
        const [carga, entrada, actor] = vi.mocked(servicio.ejecutarProcesamiento).mock.calls.at(-1) ?? [];
        expect(carga).toBe(10);
        expect(entrada).toEqual({ tipo: 'procesamiento', archivoId: 55 });
        expect(actor).toMatchObject({ id: usuario });
    });

    it.each([{ tipo: 'otro', archivoId: 55 }, { tipo: 'validacion' }, { tipo: 'validacion', archivoId: 0 }, { tipo: 'validacion', archivoId: 'x' }, {}])('el cuerpo %j responde 422', async (malo) => {
        expect((await como(request(app).post(url).send(malo), ADMIN)).status).toBe(422);
        expect(servicio.ejecutarProcesamiento).not.toHaveBeenCalled();
    });

    it('un id de carga invalido responde 422', async () => {
        expect((await como(request(app).post(`${BASE}/x/procesamientos`).send(cuerpo), ADMIN)).status).toBe(422);
    });
});
