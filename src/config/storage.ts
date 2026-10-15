import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { env } from './env';

// Todo lo que se guarda en disco cuelga de esta raiz (ruta absoluta, fuera de src/)
export const RAIZ_STORAGE = path.resolve(env.STORAGE_DIR);
export const RAIZ_ORIGINALES = path.join(RAIZ_STORAGE, 'originales'); // archivos ya aceptados
export const RAIZ_TEMPORAL = path.join(RAIZ_STORAGE, 'tmp'); // archivos mientras se reciben y revisan

export const MAX_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

/** Crea las carpetas si no existen. */
export function asegurarCarpetas(): void {
    mkdirSync(RAIZ_ORIGINALES, { recursive: true });
    mkdirSync(RAIZ_TEMPORAL, { recursive: true });
}