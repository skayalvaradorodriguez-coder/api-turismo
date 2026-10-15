import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../src/modules/auth/auth.types';
import type { Fuente } from '../../src/modules/fuentes/fuentes.repository';
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

// El servicio tambien se simula: estas pruebas no tocan la base ni la bitacora
vi.mock('../../src/modules/fuentes/fuentes.service', () => ({
    listarFuentes: vi.fn(),
    obtenerFuente: vi.fn(),
    crearFuente: vi.fn(),
    editarFuente: vi.fn(),
    cambiarEstadoFuente: vi.fn(),
}));

import { app } from '../../src/app';
import * as servicio from '../../src/modules/fuentes/fuentes.service';
import { firmarSesion } from '../../src/utils/token';

const BASE = '/api/v1/fuentes';
const SUPER_ADMIN = 1001;
const ADMIN = 1002;
const INVESTIGADOR = 1003;
const EXTERNO = 1004;

const cookie = (id: number) => `wt_session=${firmarSesion(id)}`;

const valido = { codigo: 'observatorio_upse', nombre: 'Observatorio Turistico UPSE', institucion: 'UPSE' };

const fuente: Fuente = {
    id: 5,
    codigo: 'observatorio_upse',
    nombre: 'Observatorio Turistico UPSE',
    institucion: 'UPSE',
    descripcion: null,
    tipoFuente: null,
    mecanismoAcceso: null,
    frecuenciaActualizacion: null,
    procedencia: null,
    licenciaUso: null,
    responsable: null,
    estado: 'activa',
    creadoPor: 1,
    creadaEn: new Date('2026-01-01T00:00:00Z'),
    actualizadaEn: new Date('2026-01-01T00:00:00Z'),
};

const rutas = [
    { metodo: 'get', url: BASE },
    { metodo: 'get', url: `${BASE}/5` },
    { metodo: 'post', url: BASE, cuerpo: valido },
    { metodo: 'put', url: `${BASE}/5`, cuerpo: { nombre: 'Nombre nuevo', institucion: 'UPSE' } },
    { metodo: 'patch', url: `${BASE}/5/estado`, cuerpo: { estado: 'inactiva' } },
] as const;

const soloLectura = rutas.slice(0, 2);
const gestion = rutas.slice(2);

function enviar(ruta: (typeof rutas)[number], usuarioId?: number) {
    let peticion = request(app)[ruta.metodo](ruta.url);
    if (usuarioId) peticion = peticion.set('Cookie', cookie(usuarioId));
    return 'cuerpo' in ruta ? peticion.send(ruta.cuerpo) : peticion;
}

beforeEach(() => {
    for (const f of [
        servicio.listarFuentes,
        servicio.obtenerFuente,
        servicio.crearFuente,
        servicio.editarFuente,
        servicio.cambiarEstadoFuente,
    ]) {
        vi.mocked(f).mockReset();
    }
});

describe('fuentes (HTTP)', () => {
    it('sin sesion, todas las rutas responden 401', async () => {
        for (const ruta of rutas) {
            expect((await enviar(ruta)).status, `${ruta.metodo} ${ruta.url}`).toBe(401);
        }
    });

    it('un usuario externo recibe 403 en todas las rutas', async () => {
        for (const ruta of rutas) {
            expect((await enviar(ruta, EXTERNO)).status, `${ruta.metodo} ${ruta.url}`).toBe(403);
        }
    });

    it('sin permiso responde 403 antes de revisar el cuerpo', async () => {
        const res = await request(app).post(BASE).set('Cookie', cookie(EXTERNO)).send({ codigo: 'MALO' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SIN_PERMISO');
    });

    it('un investigador puede consultar pero no gestionar', async () => {
        vi.mocked(servicio.listarFuentes).mockResolvedValue([fuente]);
        vi.mocked(servicio.obtenerFuente).mockResolvedValue(fuente);

        for (const ruta of soloLectura) {
            expect((await enviar(ruta, INVESTIGADOR)).status, `${ruta.metodo} ${ruta.url}`).toBe(200);
        }
        for (const ruta of gestion) {
            expect((await enviar(ruta, INVESTIGADOR)).status, `${ruta.metodo} ${ruta.url}`).toBe(403);
        }
        expect(servicio.crearFuente).not.toHaveBeenCalled();
    });

    it.each([
        [SUPER_ADMIN, 'super_admin'],
        [ADMIN, 'admin'],
    ])('el usuario %s (%s) puede crear una fuente; el actor sale de la sesion', async (id) => {
        vi.mocked(servicio.crearFuente).mockResolvedValue(fuente);

        const res = await request(app).post(BASE).set('Cookie', cookie(id)).send(valido);

        expect(res.status).toBe(201);
        expect(res.body.ok).toBe(true);
        expect(res.body.data.fuente.codigo).toBe('observatorio_upse');
        expect(servicio.crearFuente).toHaveBeenCalledWith(expect.objectContaining(valido), expect.objectContaining({ id }));
    });

    it('rechaza un cuerpo invalido con 422 y no llama al servicio', async () => {
        const res = await request(app)
            .post(BASE)
            .set('Cookie', cookie(SUPER_ADMIN))
            .send({ ...valido, codigo: 'Codigo Malo' });

        expect(res.status).toBe(422);
        expect(res.body.code).toBe('VALIDACION');
        expect(servicio.crearFuente).not.toHaveBeenCalled();
    });

    it('rechaza campos que no existen, como creadoPor', async () => {
        const res = await request(app)
            .post(BASE)
            .set('Cookie', cookie(SUPER_ADMIN))
            .send({ ...valido, creadoPor: 999 });

        expect(res.status).toBe(422);
        expect(servicio.crearFuente).not.toHaveBeenCalled();
    });

    it.each(['abc', '0', '-1', '1.5'])('rechaza el id invalido "%s"', async (id) => {
        const res = await request(app).get(`${BASE}/${id}`).set('Cookie', cookie(SUPER_ADMIN));

        expect(res.status).toBe(422);
        expect(servicio.obtenerFuente).not.toHaveBeenCalled();
    });

    it('edita con PUT y entrega el id numerico y el actor al servicio', async () => {
        vi.mocked(servicio.editarFuente).mockResolvedValue(fuente);

        const res = await request(app)
            .put(`${BASE}/5`)
            .set('Cookie', cookie(ADMIN))
            .send({ nombre: 'Nombre nuevo', institucion: 'UPSE' });

        expect(res.status).toBe(200);
        expect(servicio.editarFuente).toHaveBeenCalledWith(
            5,
            expect.objectContaining({ nombre: 'Nombre nuevo' }),
            expect.objectContaining({ id: ADMIN }),
        );
    });

    it('PUT no acepta cambiar el codigo', async () => {
        const res = await request(app)
            .put(`${BASE}/5`)
            .set('Cookie', cookie(ADMIN))
            .send({ nombre: 'Nombre nuevo', institucion: 'UPSE', codigo: 'otro_codigo' });

        expect(res.status).toBe(422);
        expect(servicio.editarFuente).not.toHaveBeenCalled();
    });

    it('cambia el estado con PATCH', async () => {
        vi.mocked(servicio.cambiarEstadoFuente).mockResolvedValue({ ...fuente, estado: 'inactiva' });

        const res = await request(app)
            .patch(`${BASE}/5/estado`)
            .set('Cookie', cookie(ADMIN))
            .send({ estado: 'inactiva' });

        expect(res.status).toBe(200);
        expect(res.body.data.fuente.estado).toBe('inactiva');
        expect(servicio.cambiarEstadoFuente).toHaveBeenCalledWith(5, 'inactiva', expect.objectContaining({ id: ADMIN }));
    });

    it('rechaza un estado invalido', async () => {
        const res = await request(app)
            .patch(`${BASE}/5/estado`)
            .set('Cookie', cookie(ADMIN))
            .send({ estado: 'borrada' });

        expect(res.status).toBe(422);
        expect(servicio.cambiarEstadoFuente).not.toHaveBeenCalled();
    });

    it('filtra la lista por estado', async () => {
        vi.mocked(servicio.listarFuentes).mockResolvedValue([]);

        const res = await request(app).get(`${BASE}?estado=activa`).set('Cookie', cookie(INVESTIGADOR));

        expect(res.status).toBe(200);
        expect(servicio.listarFuentes).toHaveBeenCalledWith('activa');
    });

    it('rechaza un filtro de estado desconocido', async () => {
        const res = await request(app).get(`${BASE}?estado=cualquiera`).set('Cookie', cookie(INVESTIGADOR));

        expect(res.status).toBe(422);
        expect(servicio.listarFuentes).not.toHaveBeenCalled();
    });

    it('devuelve la fuente pedida por id', async () => {
        vi.mocked(servicio.obtenerFuente).mockResolvedValue(fuente);

        const res = await request(app).get(`${BASE}/5`).set('Cookie', cookie(INVESTIGADOR));

        expect(res.status).toBe(200);
        expect(res.body.data.fuente.id).toBe(5);
        expect(servicio.obtenerFuente).toHaveBeenCalledWith(5);
    });

    it('traduce un error del servicio (404) a la respuesta HTTP', async () => {
        vi.mocked(servicio.obtenerFuente).mockRejectedValue(
            new AppError('La fuente no existe', 404, 'FUENTE_NO_ENCONTRADA'),
        );

        const res = await request(app).get(`${BASE}/99`).set('Cookie', cookie(SUPER_ADMIN));

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('FUENTE_NO_ENCONTRADA');
    });
});