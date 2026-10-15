import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';

export interface TipoArchivo {
    mime: string;
    /** Primeros bytes que debe tener el archivo (para formatos binarios). */
    firmas?: Buffer[];
    /** Formato de texto: no debe contener bytes nulos. */
    texto?: boolean;
}

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PDF = Buffer.from('%PDF-');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG = Buffer.from([0xff, 0xd8, 0xff]);

// Es un Map (y no un objeto) para que extensiones como "constructor" o "__proto__" no se cuelen
const TIPOS = new Map<string, TipoArchivo>([
    ['csv', { mime: 'text/csv', texto: true }],
    ['txt', { mime: 'text/plain', texto: true }],
    ['json', { mime: 'application/json', texto: true }],
    ['xlsx', { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', firmas: [ZIP] }],
    ['xls', { mime: 'application/vnd.ms-excel', firmas: [OLE] }],
    ['pdf', { mime: 'application/pdf', firmas: [PDF] }],
    ['png', { mime: 'image/png', firmas: [PNG] }],
    ['jpg', { mime: 'image/jpeg', firmas: [JPG] }],
    ['jpeg', { mime: 'image/jpeg', firmas: [JPG] }],
]);

export const EXTENSIONES_PERMITIDAS: string[] = [...TIPOS.keys()];

export function tipoPermitido(extension: string): TipoArchivo | undefined {
    return TIPOS.get(extension);
}

/** Ultima extension en minusculas, o null si el nombre no tiene una extension valida. */
export function extensionDe(nombre: string): string | null {
    const punto = nombre.lastIndexOf('.');
    if (punto <= 0 || punto === nombre.length - 1) return null;
    const extension = nombre.slice(punto + 1).toLowerCase();
    return /^[a-z0-9]{1,10}$/.test(extension) ? extension : null;
}

/**
 * Deja el nombre que puso el usuario listo para guardarse COMO DATO (nunca como ruta):
 * quita carpetas, caracteres de control y marcas que invierten el sentido del texto.
 */
export function limpiarNombreOriginal(nombre: string): string | null {
    const base = nombre.split(/[\\/]/).pop() ?? '';
    const limpio = base.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim();
    return limpio.length > 0 && limpio.length <= 255 ? limpio : null;
}

/** Nombre con el que se guarda en disco: lo genera el sistema, nunca el usuario. */
export function nombreAleatorio(extension: string): string {
    return `${randomUUID()}.${extension}`;
}

/** Construye una ruta y comprueba que quede DENTRO de la carpeta indicada. */
export function rutaDentro(raiz: string, nombre: string): string {
    const base = path.resolve(raiz);
    const destino = path.resolve(base, nombre);
    if (!destino.startsWith(base + path.sep)) throw new Error('Ruta fuera de la carpeta permitida');
    return destino;
}

/** Huella SHA-256 (hexadecimal), leyendo el archivo por partes. */
export function sha256DeArchivo(ruta: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        createReadStream(ruta)
            .on('error', reject)
            .on('data', (parte) => hash.update(parte))
            .on('end', () => resolve(hash.digest('hex')));
    });
}

/** Primeros bytes del archivo (para revisar su contenido real). */
export async function leerCabecera(ruta: string, bytes = 8192): Promise<Buffer> {
    const archivo = await open(ruta, 'r');
    try {
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await archivo.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await archivo.close();
    }
}

/** Comprueba que el contenido real corresponda a la extension. Un archivo vacio nunca coincide. */
export function contenidoCoincide(extension: string, cabecera: Buffer): boolean {
    const tipo = TIPOS.get(extension);
    if (!tipo || cabecera.length === 0) return false;
    if (tipo.firmas) return tipo.firmas.some((firma) => cabecera.subarray(0, firma.length).equals(firma));
    if (tipo.texto) return !cabecera.includes(0);
    return false;
}