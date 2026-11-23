import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const entorno = vi.hoisted(() => ({ PROCESAMIENTO_URL: 'http://servicio.test:8001', PROCESAMIENTO_CLAVE: 'k'.repeat(40) as string | undefined, PROCESAMIENTO_TIMEOUT_SEG: 5 }));
vi.mock('../../src/config/env', () => ({ env: entorno }));

import { consultarServicio } from '../../src/modules/procesamiento/procesamiento.cliente';

const valida = {
    estructura: { codigo: 'ots_turista_v1', nombre: 'n' },
    formato: 'csv',
    hoja: null,
    resumen: { filas_leidas: 1, filas_validas: 1, filas_excluidas: 0, errores: 0, alertas: 0 },
    hallazgos: [],
};
const responder = (estado: number, cuerpo: unknown) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status: estado }));

let carpeta: string;
let ruta: string;
beforeAll(async () => {
    carpeta = await mkdtemp(path.join(tmpdir(), 'cliente-'));
    ruta = path.join(carpeta, 'a.csv');
    await writeFile(ruta, 'a;b\n1;2\n');
});
afterAll(async () => rm(carpeta, { recursive: true, force: true }));
beforeEach(() => {
    entorno.PROCESAMIENTO_CLAVE = 'k'.repeat(40);
});
afterEach(() => vi.unstubAllGlobals());

describe('consultarServicio', () => {
    it('sin clave configurada responde 503 y no llama al servicio', async () => {
        entorno.PROCESAMIENTO_CLAVE = undefined;
        const f = responder(200, valida);
        vi.stubGlobal('fetch', f);
        await expect(consultarServicio('validar', ruta, 'a.csv')).rejects.toMatchObject({ statusCode: 503, code: 'PROCESAMIENTO_NO_CONFIGURADO' });
        expect(f).not.toHaveBeenCalled();
    });

    it('envia el archivo con la clave interna y rellena lo opcional', async () => {
        const f = responder(200, valida);
        vi.stubGlobal('fetch', f);
        const r = await consultarServicio('procesar', ruta, 'a.csv');
        expect(r.cambios).toEqual([]);
        expect(r.registros).toEqual([]);
        const [url, opciones] = f.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('http://servicio.test:8001/v1/procesar');
        expect((opciones.headers as Record<string, string>)['X-Internal-Key']).toBe('k'.repeat(40));
        expect((opciones.body as FormData).get('archivo')).toBeInstanceOf(Blob);
    });

    it('si el servicio no responde, 502 sin detalles', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
        await expect(consultarServicio('validar', ruta, 'a.csv')).rejects.toMatchObject({ statusCode: 502, code: 'SERVICIO_PROCESAMIENTO_NO_DISPONIBLE' });
    });

    it('un archivo ilegible o demasiado grande se informa como 422 con el mensaje del servicio', async () => {
        vi.stubGlobal('fetch', responder(422, { codigo: 'archivo_ilegible', mensaje: 'No se pudo abrir el archivo xlsx' }));
        await expect(consultarServicio('validar', ruta, 'a.xlsx')).rejects.toMatchObject({ statusCode: 422, code: 'ARCHIVO_ARCHIVO_ILEGIBLE', message: 'No se pudo abrir el archivo xlsx' });
        vi.stubGlobal('fetch', responder(413, { codigo: 'archivo_demasiado_grande', mensaje: 'grande' }));
        await expect(consultarServicio('validar', ruta, 'a.xlsx')).rejects.toMatchObject({ statusCode: 422 });
    });

    it('clave rechazada o error interno: 502 generico, sin repetir lo que dijo el servicio', async () => {
        vi.stubGlobal('fetch', responder(401, { codigo: 'no_autorizado', mensaje: 'Clave interna invalida' }));
        const error = await consultarServicio('validar', ruta, 'a.csv').catch((e: unknown) => e);
        expect(error).toMatchObject({ statusCode: 502, code: 'SERVICIO_PROCESAMIENTO_ERROR' });
        expect((error as Error).message).not.toContain('Clave');
    });

    it('una respuesta con otra forma se rechaza', async () => {
        vi.stubGlobal('fetch', responder(200, { hola: 1 }));
        await expect(consultarServicio('validar', ruta, 'a.csv')).rejects.toMatchObject({ statusCode: 502, code: 'SERVICIO_PROCESAMIENTO_ERROR' });
    });
});
