import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const carpetas = vi.hoisted(() => ({ raiz: '', temporal: '' }));

// El almacenamiento apunta a una carpeta temporal de prueba y con un limite pequeno (1 KB)
vi.mock('../../src/config/storage', async () => {
    const { mkdirSync } = await import('node:fs');
    return {
        get RAIZ_STORAGE() {
            return carpetas.raiz;
        },
        get RAIZ_ORIGINALES() {
            return carpetas.raiz;
        },
        get RAIZ_TEMPORAL() {
            return carpetas.temporal;
        },
        MAX_BYTES: 1024,
        asegurarCarpetas: () => mkdirSync(carpetas.temporal, { recursive: true }),
    };
});

// El servicio se simula: estas pruebas revisan la capa HTTP, no la base ni la bitacora
vi.mock('../../src/modules/cargas/cargas.service', () => ({
    listarCargas: vi.fn(),
    obtenerCarga: vi.fn(),
    crearCarga: vi.fn(),
    agregarArchivo: vi.fn(),
    actualizarMetadatos: vi.fn(),
    rechazarCarga: vi.fn(),
    prepararDescarga: vi.fn(),
}));

import { app } from '../../src/app';
import * as servicio from '../../src/modules/cargas/cargas.service';
import { firmarSesion } from '../../src/utils/token';

const BASE = '/api/v1/cargas';
const SUPER_ADMIN = 1001;
const ADMIN = 1002;
const INVESTIGADOR = 1003;
const EXTERNO = 1004;

const cookie = (id: number) => `wt_session=${firmarSesion(id)}`;

/** Identifica a la persona en la peticion mediante su cookie de sesion. */
function como(peticion: Test, usuarioId?: number): Test {
    return usuarioId ? peticion.set('Cookie', cookie(usuarioId)) : peticion;
}

const detalle = { carga: { id: 10 }, archivos: [], metadatos: [] };
const csv = Buffer.from('a,b\n1,2\n');

const enTemporal = () => readdir(carpetas.temporal).catch(() => [] as string[]);
const m = <T>(f: T) => vi.mocked(f as unknown as (...a: unknown[]) => unknown);

beforeAll(async () => {
    carpetas.raiz = await mkdtemp(path.join(tmpdir(), 'cargas-http-'));
    carpetas.temporal = path.join(carpetas.raiz, 'tmp');
});
afterAll(async () => {
    await rm(carpetas.raiz, { recursive: true, force: true });
});

beforeEach(async () => {
    for (const f of Object.values(servicio)) vi.mocked(f as () => unknown).mockReset();
    await rm(carpetas.temporal, { recursive: true, force: true });
    await mkdir(carpetas.temporal, { recursive: true });
    // como el servicio real, el simulado "toma" el archivo recibido (lo mueve) al terminar bien
    m(servicio.crearCarga).mockImplementation(async (_d, archivo) => {
        await rm((archivo as { rutaTemporal: string }).rutaTemporal);
        return detalle;
    });
    m(servicio.agregarArchivo).mockImplementation(async (_i, archivo) => {
        await rm((archivo as { rutaTemporal: string }).rutaTemporal);
        return detalle;
    });
});

const formularioValido = (p: Test) => p.field('fuenteId', '3').attach('archivo', csv, 'santa_elena.csv');

const rutas = [
    { metodo: 'get', url: BASE },
    { metodo: 'get', url: `${BASE}/10` },
    { metodo: 'get', url: `${BASE}/10/archivos/55/descarga` },
    { metodo: 'post', url: BASE },
    { metodo: 'post', url: `${BASE}/10/archivos` },
    { metodo: 'patch', url: `${BASE}/10/metadatos` },
    { metodo: 'post', url: `${BASE}/10/rechazo` },
] as const;
const soloLectura = rutas.slice(0, 3);
const gestion = rutas.slice(3);

describe('cargas (HTTP): acceso', () => {
    it('sin sesion, todas las rutas responden 401', async () => {
        for (const ruta of rutas) {
            const res = await request(app)[ruta.metodo](ruta.url);
            expect(res.status, `${ruta.metodo} ${ruta.url}`).toBe(401);
        }
    });

    it('un usuario externo recibe 403 en todas las rutas', async () => {
        for (const ruta of rutas) {
            const res = await como(request(app)[ruta.metodo](ruta.url), EXTERNO);
            expect(res.status, `${ruta.metodo} ${ruta.url}`).toBe(403);
        }
    });

    it('un investigador puede consultar pero no gestionar', async () => {
        m(servicio.listarCargas).mockResolvedValue({ cargas: [], total: 0 });
        m(servicio.obtenerCarga).mockResolvedValue(detalle);
        m(servicio.prepararDescarga).mockRejectedValue(new AppError('x', 404, 'ARCHIVO_NO_ENCONTRADO'));

        for (const ruta of soloLectura) {
            const res = await como(request(app)[ruta.metodo](ruta.url), INVESTIGADOR);
            expect(res.status, `${ruta.metodo} ${ruta.url}`).not.toBe(403);
        }
        for (const ruta of gestion) {
            const res = await como(request(app)[ruta.metodo](ruta.url), INVESTIGADOR);
            expect(res.status, `${ruta.metodo} ${ruta.url}`).toBe(403);
        }
    });

    it('sin permiso responde 403 y ni siquiera recibe el archivo', async () => {
        const res = await formularioValido(como(request(app).post(BASE), EXTERNO));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SIN_PERMISO');
        expect(servicio.crearCarga).not.toHaveBeenCalled();
        expect(await enTemporal()).toEqual([]);
    });
});

describe('cargas (HTTP): crear con archivo', () => {
    it.each([SUPER_ADMIN, ADMIN])('el usuario %s puede crear; el actor sale de la sesion', async (id) => {
        const res = await como(request(app).post(BASE), id)
            .field('fuenteId', '3')
            .field('descripcion', 'Catastro 2026')
            .field('periodoDesde', '2026-01-01')
            .field('metadatos', JSON.stringify({ cobertura: 'Provincia' }))
            .attach('archivo', csv, 'santa_elena.csv');

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ ok: true, data: detalle });

        const [datos, archivo, actor] = m(servicio.crearCarga).mock.calls[0] as [
            Record<string, unknown>,
            { rutaTemporal: string; nombreOriginal: string },
            { id: number },
        ];
        expect(datos).toMatchObject({
            fuenteId: 3,
            descripcion: 'Catastro 2026',
            periodoDesde: '2026-01-01',
            nivelIngreso: 1,
            metadatos: { cobertura: 'Provincia' },
        });
        expect(archivo.nombreOriginal).toBe('santa_elena.csv');
        expect(path.dirname(archivo.rutaTemporal)).toBe(carpetas.temporal);
        expect(path.basename(archivo.rutaTemporal)).toMatch(/^[0-9a-f-]{36}\.tmp$/);
        expect(actor.id).toBe(id);
        expect(await enTemporal()).toEqual([]);
    });

    it('conserva las tildes y la enie del nombre del archivo', async () => {
        await como(request(app).post(BASE), ADMIN).field('fuenteId', '3').attach('archivo', csv, 'Catastro_año_Salinas_ñandú.csv');

        const archivo = m(servicio.crearCarga).mock.calls[0]?.[1] as { nombreOriginal: string };
        expect(archivo.nombreOriginal).toBe('Catastro_año_Salinas_ñandú.csv');
    });

    it('sin archivo responde 422', async () => {
        const res = await como(request(app).post(BASE), ADMIN).field('fuenteId', '3');
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('ARCHIVO_REQUERIDO');
        expect(servicio.crearCarga).not.toHaveBeenCalled();
    });

    it('un tipo no permitido se rechaza al empezar y no queda nada en la carpeta temporal', async () => {
        const res = await como(request(app).post(BASE), ADMIN)
            .field('fuenteId', '3')
            .attach('archivo', Buffer.from('MZ'), 'programa.exe');

        expect(res.status).toBe(422);
        expect(res.body.code).toBe('TIPO_ARCHIVO_NO_PERMITIDO');
        expect(servicio.crearCarga).not.toHaveBeenCalled();
        expect(await enTemporal()).toEqual([]);
    });

    it('un archivo que pasa el tamano maximo responde 413 y no deja restos', async () => {
        const res = await como(request(app).post(BASE), ADMIN)
            .field('fuenteId', '3')
            .attach('archivo', Buffer.alloc(5000, 97), 'grande.csv');

        expect(res.status).toBe(413);
        expect(res.body.code).toBe('ARCHIVO_MUY_GRANDE');
        expect(servicio.crearCarga).not.toHaveBeenCalled();
        expect(await enTemporal()).toEqual([]);
    });

    it('datos invalidos responden 422 y se descarta el archivo ya recibido', async () => {
        const res = await como(request(app).post(BASE), ADMIN).field('fuenteId', 'abc').attach('archivo', csv, 'a.csv');

        expect(res.status).toBe(422);
        expect(res.body.code).toBe('VALIDACION');
        expect(servicio.crearCarga).not.toHaveBeenCalled();
        expect(await enTemporal()).toEqual([]);
    });

    it('rechaza campos que no existen, como estado o cargadoPor', async () => {
        for (const [campo, valor] of [['estado', 'publicada'], ['cargadoPor', '1']] as const) {
            const res = await como(request(app).post(BASE), ADMIN).field('fuenteId', '3').field(campo, valor).attach('archivo', csv, 'a.csv');
            expect(res.status, campo).toBe(422);
        }
        expect(servicio.crearCarga).not.toHaveBeenCalled();
        expect(await enTemporal()).toEqual([]);
    });

    it('rechaza un archivo en un campo con otro nombre', async () => {
        const res = await como(request(app).post(BASE), ADMIN).field('fuenteId', '3').attach('otro', csv, 'a.csv');
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('ARCHIVO_INESPERADO');
        expect(await enTemporal()).toEqual([]);
    });

    it('rechaza dos archivos en la misma peticion', async () => {
        const res = await como(request(app).post(BASE), ADMIN)
            .field('fuenteId', '3')
            .attach('archivo', csv, 'a.csv')
            .attach('archivo', csv, 'b.csv');
        expect(res.status).toBe(422);
        expect(servicio.crearCarga).not.toHaveBeenCalled();
        expect(await enTemporal()).toEqual([]);
    });

    it('si el servicio falla, devuelve su error y no deja el archivo temporal', async () => {
        m(servicio.crearCarga).mockRejectedValue(new AppError('La fuente esta inactiva', 409, 'FUENTE_INACTIVA'));

        const res = await formularioValido(como(request(app).post(BASE), ADMIN));

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('FUENTE_INACTIVA');
        expect(await enTemporal()).toEqual([]);
    });
});

describe('cargas (HTTP): agregar archivo, metadatos y rechazo', () => {
    it('agrega un archivo a una carga existente', async () => {
        const res = await como(request(app).post(`${BASE}/10/archivos`), ADMIN).attach('archivo', csv, 'nuevo.csv');

        expect(res.status).toBe(201);
        const [id, archivo] = m(servicio.agregarArchivo).mock.calls[0] as [number, { nombreOriginal: string }];
        expect(id).toBe(10);
        expect(archivo.nombreOriginal).toBe('nuevo.csv');
    });

    it('un id invalido responde 422 y descarta el archivo', async () => {
        const res = await como(request(app).post(`${BASE}/abc/archivos`), ADMIN).attach('archivo', csv, 'nuevo.csv');

        expect(res.status).toBe(422);
        expect(servicio.agregarArchivo).not.toHaveBeenCalled();
        expect(await enTemporal()).toEqual([]);
    });

    it('actualiza metadatos y valida el cuerpo', async () => {
        m(servicio.actualizarMetadatos).mockResolvedValue(detalle);

        const ok = await como(request(app).patch(`${BASE}/10/metadatos`), ADMIN).send({ metadatos: { cobertura: 'Salinas', muestra: 385 } });
        expect(ok.status).toBe(200);
        expect(m(servicio.actualizarMetadatos).mock.calls[0]?.[1]).toEqual({ metadatos: { cobertura: 'Salinas', muestra: '385' } });

        const vacio = await como(request(app).patch(`${BASE}/10/metadatos`), ADMIN).send({ metadatos: {} });
        expect(vacio.status).toBe(422);
    });

    it('rechaza una carga con motivo y valida el cuerpo', async () => {
        m(servicio.rechazarCarga).mockResolvedValue(detalle);

        const ok = await como(request(app).post(`${BASE}/10/rechazo`), ADMIN).send({ motivo: 'El archivo esta incompleto' });
        expect(ok.status).toBe(200);
        expect(m(servicio.rechazarCarga).mock.calls[0]?.slice(0, 2)).toEqual([10, 'El archivo esta incompleto']);

        const corto = await como(request(app).post(`${BASE}/10/rechazo`), ADMIN).send({ motivo: 'no' });
        expect(corto.status).toBe(422);
    });
});

describe('cargas (HTTP): consultas y descarga', () => {
    it('lista con filtros convertidos a su tipo y devuelve la paginacion', async () => {
        m(servicio.listarCargas).mockResolvedValue({ cargas: [], total: 0 });

        const res = await como(request(app).get(`${BASE}?fuenteId=3&estado=recibida&limite=10&pagina=2`), INVESTIGADOR);

        expect(res.status).toBe(200);
        expect(m(servicio.listarCargas).mock.calls[0]?.[0]).toEqual({ fuenteId: 3, estado: 'recibida', limite: 10, pagina: 2 });
        expect(res.body.data).toMatchObject({ total: 0, pagina: 2, limite: 10 });
        expect((await como(request(app).get(`${BASE}?limite=0`), INVESTIGADOR)).status).toBe(422);
    });

    it('descarga el original como adjunto, con el tipo de nuestra tabla y sin adivinar contenido', async () => {
        const ruta = path.join(carpetas.raiz, 'original.csv');
        await writeFile(ruta, csv);
        m(servicio.prepararDescarga).mockResolvedValue({
            ruta,
            nombreOriginal: 'Catastro_año.csv',
            tipoMime: 'text/csv',
            tamanoBytes: csv.length,
        });

        const res = await como(request(app).get(`${BASE}/10/archivos/55/descarga`), INVESTIGADOR).buffer(true);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toMatch(/^attachment;/);
        expect(decodeURIComponent(res.headers['content-disposition'] as string)).toContain('Catastro_año.csv');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(res.text).toBe(csv.toString());
        expect(m(servicio.prepararDescarga).mock.calls[0]?.slice(0, 2)).toEqual([10, 55]);
        await stat(ruta); // la descarga no borra el original
    });

    it('si el servicio dice que no existe, responde 404', async () => {
        m(servicio.prepararDescarga).mockRejectedValue(new AppError('El archivo no existe', 404, 'ARCHIVO_NO_ENCONTRADO'));
        const res = await como(request(app).get(`${BASE}/10/archivos/55/descarga`), ADMIN);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ARCHIVO_NO_ENCONTRADO');
    });
});