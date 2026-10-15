import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    contenidoCoincide,
    extensionDe,
    leerCabecera,
    limpiarNombreOriginal,
    nombreAleatorio,
    rutaDentro,
    sha256DeArchivo,
    tipoPermitido,
} from '../../src/utils/archivos';

let carpeta: string;

beforeAll(async () => {
    carpeta = await mkdtemp(path.join(os.tmpdir(), 'wt-archivos-'));
});

afterAll(async () => {
    await rm(carpeta, { recursive: true, force: true });
});

async function crear(nombre: string, contenido: Buffer | string): Promise<string> {
    const ruta = path.join(carpeta, nombre);
    await writeFile(ruta, contenido);
    return ruta;
}

describe('extensionDe', () => {
    it('pasa a minusculas y toma la ultima extension', () => {
        expect(extensionDe('Datos.CSV')).toBe('csv');
        expect(extensionDe('a.b.xlsx')).toBe('xlsx');
        expect(extensionDe('malo.pdf.exe')).toBe('exe');
    });

    it('devuelve null si no hay una extension valida', () => {
        expect(extensionDe('sin_extension')).toBeNull();
        expect(extensionDe('.csv')).toBeNull();
        expect(extensionDe('termina.')).toBeNull();
        expect(extensionDe('raro.c$v')).toBeNull();
    });
});

describe('tipoPermitido', () => {
    it('acepta los tipos de la lista', () => {
        for (const ext of ['csv', 'txt', 'json', 'xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg']) {
            expect(tipoPermitido(ext), ext).toBeDefined();
        }
    });

    it('rechaza ejecutables, paginas web y comprimidos', () => {
        for (const ext of ['exe', 'bat', 'js', 'html', 'svg', 'php', 'zip', 'docx']) {
            expect(tipoPermitido(ext), ext).toBeUndefined();
        }
    });

    it('no se deja enganar por nombres especiales del lenguaje', () => {
        expect(tipoPermitido('constructor')).toBeUndefined();
        expect(tipoPermitido('__proto__')).toBeUndefined();
        expect(tipoPermitido('toString')).toBeUndefined();
    });
});

describe('limpiarNombreOriginal', () => {
    it('quita las carpetas del nombre', () => {
        expect(limpiarNombreOriginal('C:\\Users\\ana\\datos.csv')).toBe('datos.csv');
        expect(limpiarNombreOriginal('../../etc/passwd')).toBe('passwd');
        expect(limpiarNombreOriginal('a/b/c.csv')).toBe('c.csv');
    });

    it('quita caracteres de control y de inversion de texto', () => {
        expect(limpiarNombreOriginal('da\u0000tos.csv')).toBe('datos.csv');
        expect(limpiarNombreOriginal('foto\u202Egpj.exe')).toBe('fotogpj.exe');
    });

    it('conserva tildes y espacios', () => {
        expect(limpiarNombreOriginal('Catálogo turístico 2026.csv')).toBe('Catálogo turístico 2026.csv');
    });

    it('rechaza nombres vacios o demasiado largos', () => {
        expect(limpiarNombreOriginal('')).toBeNull();
        expect(limpiarNombreOriginal('   ')).toBeNull();
        expect(limpiarNombreOriginal('../')).toBeNull();
        expect(limpiarNombreOriginal(`${'x'.repeat(252)}.csv`)).toBeNull();
    });
});

describe('nombreAleatorio', () => {
    it('genera un uuid con la extension y nunca se repite', () => {
        const a = nombreAleatorio('csv');
        expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/);
        expect(nombreAleatorio('csv')).not.toBe(a);
    });
});

describe('rutaDentro', () => {
    const raiz = path.join(os.tmpdir(), 'wt-raiz', 'originales');

    it('acepta un nombre que queda dentro de la carpeta', () => {
        expect(rutaDentro(raiz, 'a.csv')).toBe(path.join(raiz, 'a.csv'));
    });

    it('rechaza lo que intenta salir de la carpeta', () => {
        expect(() => rutaDentro(raiz, path.join('..', 'fuera.csv'))).toThrow();
        expect(() => rutaDentro(raiz, path.resolve(os.tmpdir(), 'otro.csv'))).toThrow();
        expect(() => rutaDentro(raiz, '..')).toThrow();
        expect(() => rutaDentro(raiz, '')).toThrow();
    });
});

describe('sha256DeArchivo', () => {
    it('calcula la huella correcta (vector de prueba "abc")', async () => {
        const ruta = await crear('abc.txt', 'abc');
        expect(await sha256DeArchivo(ruta)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('calcula la huella de un archivo vacio', async () => {
        const ruta = await crear('vacio.txt', '');
        expect(await sha256DeArchivo(ruta)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
});

describe('leerCabecera', () => {
    it('lee como maximo los bytes pedidos', async () => {
        const ruta = await crear('grande.bin', Buffer.alloc(10000, 1));
        expect((await leerCabecera(ruta)).length).toBe(8192);
    });

    it('en un archivo corto devuelve solo lo que hay', async () => {
        const ruta = await crear('corto.txt', 'hola');
        expect((await leerCabecera(ruta)).toString()).toBe('hola');
    });
});

describe('contenidoCoincide', () => {
    it('acepta un pdf con su firma', () => {
        expect(contenidoCoincide('pdf', Buffer.from('%PDF-1.7\n%resto'))).toBe(true);
    });

    it('acepta xlsx (zip), xls (ole)', () => {
        expect(contenidoCoincide('xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe(true);
        expect(contenidoCoincide('xls', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe(true);
    });

    it('acepta imagenes png y jpg', () => {
        expect(contenidoCoincide('png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe(true);
        expect(contenidoCoincide('jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe(true);
        expect(contenidoCoincide('jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe(true);
    });

    it('acepta texto normal y texto con BOM de UTF-8', () => {
        expect(contenidoCoincide('csv', Buffer.from('a,b\n1,2'))).toBe(true);
        expect(contenidoCoincide('csv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a,b\n1,2')]))).toBe(true);
        expect(contenidoCoincide('json', Buffer.from('{"a":1}'))).toBe(true);
    });

    it('rechaza como texto un archivo con bytes nulos (binario)', () => {
        expect(contenidoCoincide('csv', Buffer.from([0x61, 0x00, 0x62]))).toBe(false);
    });

    it('rechaza un archivo vacio', () => {
        expect(contenidoCoincide('csv', Buffer.alloc(0))).toBe(false);
        expect(contenidoCoincide('pdf', Buffer.alloc(0))).toBe(false);
    });

    it('rechaza un ejecutable renombrado como pdf, xlsx o imagen', () => {
        const exe = Buffer.from('MZ\x90\x00\x03\x00', 'latin1');
        for (const ext of ['pdf', 'xlsx', 'xls', 'png', 'jpg']) {
            expect(contenidoCoincide(ext, exe), ext).toBe(false);
        }
    });

    it('nunca acepta una extension que no esta en la lista', () => {
        expect(contenidoCoincide('exe', Buffer.from('MZ'))).toBe(false);
    });
});