import request from 'supertest';
import type { Test } from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../src/modules/auth/auth.types';
import { AppError } from '../../src/utils/AppError';

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
        1004: nuevo(1004, 'usuario'),
    };
    return { ...original, usuarioDeSesion: vi.fn(async (id: number) => usuarios[id] ?? null) };
});

// El servicio se simula: estas pruebas revisan la capa HTTP, no la base ni la bitacora
vi.mock('../../src/modules/procesamiento/procesamiento.service', () => ({
    validarCarga: vi.fn(),
    procesarCarga: vi.fn(),
    listarProcesamientosDeCarga: vi.fn(),
    obtenerHallazgos: vi.fn(),
    obtenerRegistros: vi.fn(),
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

const resultado = { procesamiento: { id: 5 }, resumen: [], estadoCarga: 'validada' };
const lista = { registros: [], total: 0 };

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(servicio.validarCarga).mockResolvedValue(resultado as never);
    vi.mocked(servicio.procesarCarga).mockResolvedValue(resultado as never);
    vi.mocked(servicio.listarProcesamientosDeCarga).mockResolvedValue([]);
    vi.mocked(servicio.obtenerHallazgos).mockResolvedValue({ hallazgos: [], total: 0, resumen: [] });
    vi.mocked(servicio.obtenerRegistros).mockResolvedValue(lista);
});

describe('POST /cargas/:id/validar y /procesar', () => {
    it.each(['validar', 'procesar'])('%s: sin sesion responde 401 y no llama al servicio', async (accion) => {
        const res = await request(app).post(`${BASE}/10/${accion}`);
        expect(res.status).toBe(401);
        expect(servicio.validarCarga).not.toHaveBeenCalled();
        expect(servicio.procesarCarga).not.toHaveBeenCalled();
    });

    it.each([
        ['validar', INVESTIGADOR],
        ['validar', EXTERNO],
        ['procesar', INVESTIGADOR],
        ['procesar', EXTERNO],
    ])('%s: el rol %i recibe 403', async (accion, usuario) => {
        const res = await como(request(app).post(`${BASE}/10/${accion}`), usuario);
        expect(res.status).toBe(403);
        expect(servicio.validarCarga).not.toHaveBeenCalled();
        expect(servicio.procesarCarga).not.toHaveBeenCalled();
    });

    it('admin valida: el actor sale de la sesion y se ignora lo que mande el cuerpo', async () => {
        const res = await como(request(app).post(`${BASE}/10/validar`), ADMIN).send({ actor: 999, id: 3 });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, data: resultado });
        expect(servicio.validarCarga).toHaveBeenCalledWith(10, expect.objectContaining({ id: ADMIN }));
    });

    it('super_admin procesa', async () => {
        const res = await como(request(app).post(`${BASE}/10/procesar`), SUPER_ADMIN);
        expect(res.status).toBe(200);
        expect(servicio.procesarCarga).toHaveBeenCalledWith(10, expect.objectContaining({ id: SUPER_ADMIN }));
    });

    it.each(['abc', '0', '-4', '1.5'])('un id invalido (%s) responde 422', async (id) => {
        const res = await como(request(app).post(`${BASE}/${id}/validar`), ADMIN);
        expect(res.status).toBe(422);
        expect(servicio.validarCarga).not.toHaveBeenCalled();
    });

    it('los errores del servicio llegan con su codigo y estado', async () => {
        vi.mocked(servicio.procesarCarga).mockRejectedValue(new AppError('Ya procesada', 409, 'CARGA_YA_PROCESADA'));
        const res = await como(request(app).post(`${BASE}/10/procesar`), ADMIN);
        expect(res.status).toBe(409);
        expect(res.body.error?.code ?? res.body.code).toBe('CARGA_YA_PROCESADA');
    });
});

describe('GET /cargas/:id/procesamientos', () => {
    it('sin sesion 401 y un usuario externo 403', async () => {
        expect((await request(app).get(`${BASE}/10/procesamientos`)).status).toBe(401);
        expect((await como(request(app).get(`${BASE}/10/procesamientos`), EXTERNO)).status).toBe(403);
    });

    it('un investigador puede consultar', async () => {
        const res = await como(request(app).get(`${BASE}/10/procesamientos`), INVESTIGADOR);
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

        await como(request(app).get(`${url}?severidad=error&regla=ruc_formato&limite=20&pagina=2`), ADMIN);
        expect(servicio.obtenerHallazgos).toHaveBeenLastCalledWith(10, 5, { severidad: 'error', regla: 'ruc_formato', limite: 20, pagina: 2 });
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

describe('GET /cargas/:id/registros', () => {
    const url = `${BASE}/10/registros`;

    it('exige sesion y rol de consulta', async () => {
        expect((await request(app).get(url)).status).toBe(401);
        expect((await como(request(app).get(url), EXTERNO)).status).toBe(403);
    });

    it('por defecto NO incluye datos sensibles, tampoco para un administrador', async () => {
        const res = await como(request(app).get(url), ADMIN);
        expect(res.status).toBe(200);
        expect(res.body.data.sensibles).toBe(false);
        expect(servicio.obtenerRegistros).toHaveBeenCalledWith(10, { limite: 50, pagina: 1 }, false, expect.objectContaining({ id: ADMIN }));
    });

    it('un investigador puede consultar con filtros, sin sensibles', async () => {
        await como(request(app).get(`${url}?canton=SALINAS&parroquia=ANCONCITO&clasificacion=HOTEL`), INVESTIGADOR);
        expect(servicio.obtenerRegistros).toHaveBeenCalledWith(
            10,
            { canton: 'SALINAS', parroquia: 'ANCONCITO', clasificacion: 'HOTEL', limite: 50, pagina: 1 },
            false,
            expect.objectContaining({ id: INVESTIGADOR }),
        );
    });

    it('un investigador que pide sensibles recibe 403 y el servicio no se llama', async () => {
        const res = await como(request(app).get(`${url}?sensibles=true`), INVESTIGADOR);
        expect(res.status).toBe(403);
        expect(servicio.obtenerRegistros).not.toHaveBeenCalled();
    });

    it.each([ADMIN, SUPER_ADMIN])('el usuario %i de gestion puede pedir sensibles', async (usuario) => {
        const res = await como(request(app).get(`${url}?sensibles=true`), usuario);
        expect(res.status).toBe(200);
        expect(res.body.data.sensibles).toBe(true);
        expect(servicio.obtenerRegistros).toHaveBeenCalledWith(10, { limite: 50, pagina: 1 }, true, expect.objectContaining({ id: usuario }));
    });

    it.each(['sensibles=si', 'sensibles=1', 'limite=999', 'pagina=-1', `canton=${'x'.repeat(101)}`])('la consulta %s responde 422', async (consulta) => {
        const res = await como(request(app).get(`${url}?${consulta}`), ADMIN);
        expect(res.status).toBe(422);
        expect(servicio.obtenerRegistros).not.toHaveBeenCalled();
    });
});
