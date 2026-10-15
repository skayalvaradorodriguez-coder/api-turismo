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
        1004: nuevo(1004, 'externo'),
    };
    return { ...original, usuarioDeSesion: vi.fn(async (id: number) => usuarios[id] ?? null) };
});

// El servicio se simula: estas pruebas revisan la capa HTTP, no la base ni la bitacora
vi.mock('../../src/modules/usuarios/usuarios.service', () => ({
    listarUsuarios: vi.fn(),
    obtenerUsuario: vi.fn(),
    cambiarRol: vi.fn(),
    cambiarEstado: vi.fn(),
}));

import { app } from '../../src/app';
import * as servicio from '../../src/modules/usuarios/usuarios.service';
import { firmarSesion } from '../../src/utils/token';

const BASE = '/api/v1/usuarios';
const SUPER_ADMIN = 1001;
const ADMIN = 1002;
const INVESTIGADOR = 1003;
const EXTERNO = 1004;

const cookie = (id: number) => `wt_session=${firmarSesion(id)}`;

function como(peticion: Test, usuarioId?: number): Test {
    return usuarioId ? peticion.set('Cookie', cookie(usuarioId)) : peticion;
}

const persona = { id: 7, nombres: 'Ana', apellidos: 'Lopez', email: 'ana@example.com', rol: 'externo', activo: true, emailVerificado: true, ultimoLoginEn: null, creadoEn: '2026-10-01T00:00:00.000Z' };

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(servicio.listarUsuarios).mockResolvedValue({ usuarios: [persona] as never, total: 1 });
    vi.mocked(servicio.obtenerUsuario).mockResolvedValue(persona as never);
    vi.mocked(servicio.cambiarRol).mockResolvedValue(persona as never);
    vi.mocked(servicio.cambiarEstado).mockResolvedValue(persona as never);
});

const llamadas = [
    ['GET lista', (u?: number) => como(request(app).get(BASE), u)],
    ['GET uno', (u?: number) => como(request(app).get(`${BASE}/7`), u)],
    ['PATCH rol', (u?: number) => como(request(app).patch(`${BASE}/7/rol`).send({ rol: 'investigador' }), u)],
    ['PATCH estado', (u?: number) => como(request(app).patch(`${BASE}/7/estado`).send({ estado: 'inactiva' }), u)],
] as const;

describe('seguridad de todas las rutas', () => {
    it.each(llamadas)('%s: sin sesion responde 401', async (_nombre, enviar) => {
        expect((await enviar()).status).toBe(401);
    });

    it.each(llamadas.flatMap(([nombre, enviar]) => [[nombre, enviar, 'investigador', INVESTIGADOR] as const, [nombre, enviar, 'externo', EXTERNO] as const]))(
        '%s: un %s recibe 403 y el servicio no se llama',
        async (_nombre, enviar, _rol, usuario) => {
            expect((await enviar(usuario)).status).toBe(403);
            expect(servicio.listarUsuarios).not.toHaveBeenCalled();
            expect(servicio.obtenerUsuario).not.toHaveBeenCalled();
            expect(servicio.cambiarRol).not.toHaveBeenCalled();
            expect(servicio.cambiarEstado).not.toHaveBeenCalled();
        },
    );

    it('el permiso se revisa antes que los datos: un investigador con cuerpo invalido recibe 403, no 422', async () => {
        const res = await como(request(app).patch(`${BASE}/7/rol`).send({ rol: 'super_admin' }), INVESTIGADOR);
        expect(res.status).toBe(403);
    });

    it.each(llamadas)('%s: admin y super_admin pueden usarla', async (_nombre, enviar) => {
        expect((await enviar(ADMIN)).status).toBe(200);
        expect((await enviar(SUPER_ADMIN)).status).toBe(200);
    });
});

describe('GET /usuarios', () => {
    it('usa valores por defecto y devuelve la pagina', async () => {
        const res = await como(request(app).get(BASE), ADMIN);

        expect(res.body).toEqual({ ok: true, data: { usuarios: [persona], total: 1, pagina: 1, limite: 50 } });
        expect(servicio.listarUsuarios).toHaveBeenCalledWith({ limite: 50, pagina: 1 });
    });

    it('pasa los filtros ya validados, con el estado como verdadero o falso', async () => {
        await como(request(app).get(`${BASE}?rol=externo&estado=activa&texto=%20ana%20&limite=20&pagina=2`), ADMIN);
        expect(servicio.listarUsuarios).toHaveBeenLastCalledWith({ rol: 'externo', activo: true, texto: 'ana', limite: 20, pagina: 2 });

        await como(request(app).get(`${BASE}?estado=inactiva`), ADMIN);
        expect(servicio.listarUsuarios).toHaveBeenLastCalledWith({ activo: false, limite: 50, pagina: 1 });
    });

    it('un filtro vacio se ignora', async () => {
        await como(request(app).get(`${BASE}?rol=&estado=&texto=`), ADMIN);
        expect(servicio.listarUsuarios).toHaveBeenLastCalledWith({ limite: 50, pagina: 1 });
    });

    it.each(['rol=usuario', 'rol=inventado', 'estado=otro', 'limite=0', 'limite=201', 'pagina=0', 'pagina=abc', `texto=${'x'.repeat(101)}`])(
        'el filtro %s responde 422',
        async (consulta) => {
            const res = await como(request(app).get(`${BASE}?${consulta}`), ADMIN);
            expect(res.status).toBe(422);
            expect(servicio.listarUsuarios).not.toHaveBeenCalled();
        },
    );
});

describe('GET /usuarios/:id', () => {
    it('devuelve la cuenta', async () => {
        const res = await como(request(app).get(`${BASE}/7`), ADMIN);
        expect(res.body).toEqual({ ok: true, data: { usuario: persona } });
        expect(servicio.obtenerUsuario).toHaveBeenCalledWith(7);
    });

    it.each(['abc', '0', '-3', '1.5'])('un id invalido (%s) responde 422', async (id) => {
        expect((await como(request(app).get(`${BASE}/${id}`), ADMIN)).status).toBe(422);
        expect(servicio.obtenerUsuario).not.toHaveBeenCalled();
    });

    it('si no existe responde 404 con su codigo', async () => {
        vi.mocked(servicio.obtenerUsuario).mockRejectedValue(new AppError('El usuario no existe', 404, 'USUARIO_NO_ENCONTRADO'));
        const res = await como(request(app).get(`${BASE}/999`), ADMIN);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('USUARIO_NO_ENCONTRADO');
    });
});

describe('PATCH /usuarios/:id/rol', () => {
    it('cambia el rol: la persona que lo hace sale de la sesion', async () => {
        const res = await como(request(app).patch(`${BASE}/7/rol`).send({ rol: 'investigador' }), ADMIN);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, data: { usuario: persona } });
        expect(servicio.cambiarRol).toHaveBeenCalledWith(7, 'investigador', expect.objectContaining({ id: ADMIN }));
    });

    it.each([
        ['super_admin', { rol: 'super_admin' }],
        ['un rol viejo', { rol: 'usuario' }],
        ['un rol inventado', { rol: 'dios' }],
        ['sin rol', {}],
        ['rol que no es texto', { rol: 3 }],
        ['un campo que no existe', { rol: 'externo', id: 1 }],
        ['intentar mandar quien lo hace', { rol: 'externo', actor: 1001 }],
    ])('%s responde 422', async (_nombre, cuerpo) => {
        const res = await como(request(app).patch(`${BASE}/7/rol`).send(cuerpo), ADMIN);
        expect(res.status).toBe(422);
        expect(servicio.cambiarRol).not.toHaveBeenCalled();
    });

    it('un id invalido responde 422', async () => {
        expect((await como(request(app).patch(`${BASE}/abc/rol`).send({ rol: 'externo' }), ADMIN)).status).toBe(422);
    });

    it.each([
        [403, 'PERMISO_INSUFICIENTE'],
        [403, 'CUENTA_PROPIA'],
        [403, 'SUPER_ADMIN_PROTEGIDO'],
        [404, 'USUARIO_NO_ENCONTRADO'],
        [409, 'ROL_SIN_CAMBIOS'],
    ])('los errores del servicio (%i %s) llegan con su codigo', async (estado, codigo) => {
        vi.mocked(servicio.cambiarRol).mockRejectedValue(new AppError('mensaje', estado, codigo));
        const res = await como(request(app).patch(`${BASE}/7/rol`).send({ rol: 'externo' }), ADMIN);
        expect(res.status).toBe(estado);
        expect(res.body.code).toBe(codigo);
    });
});

describe('PATCH /usuarios/:id/estado', () => {
    it('desactiva y activa', async () => {
        await como(request(app).patch(`${BASE}/7/estado`).send({ estado: 'inactiva' }), ADMIN);
        expect(servicio.cambiarEstado).toHaveBeenLastCalledWith(7, false, expect.objectContaining({ id: ADMIN }));

        const res = await como(request(app).patch(`${BASE}/7/estado`).send({ estado: 'activa' }), SUPER_ADMIN);
        expect(res.status).toBe(200);
        expect(servicio.cambiarEstado).toHaveBeenLastCalledWith(7, true, expect.objectContaining({ id: SUPER_ADMIN }));
    });

    it.each([
        ['un estado que no existe', { estado: 'borrada' }],
        ['verdadero o falso en vez de palabras', { estado: true }],
        ['sin estado', {}],
        ['un campo que no existe', { estado: 'activa', rol: 'admin' }],
    ])('%s responde 422', async (_nombre, cuerpo) => {
        const res = await como(request(app).patch(`${BASE}/7/estado`).send(cuerpo), ADMIN);
        expect(res.status).toBe(422);
        expect(servicio.cambiarEstado).not.toHaveBeenCalled();
    });

    it.each([
        [403, 'CUENTA_PROPIA'],
        [403, 'SUPER_ADMIN_PROTEGIDO'],
        [409, 'ESTADO_SIN_CAMBIOS'],
    ])('los errores del servicio (%i %s) llegan con su codigo', async (estado, codigo) => {
        vi.mocked(servicio.cambiarEstado).mockRejectedValue(new AppError('mensaje', estado, codigo));
        const res = await como(request(app).patch(`${BASE}/7/estado`).send({ estado: 'inactiva' }), ADMIN);
        expect(res.status).toBe(estado);
        expect(res.body.code).toBe(codigo);
    });
});
