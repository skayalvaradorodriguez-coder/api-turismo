import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { env } from '../../src/config/env';
import { MAX_BYTES, RAIZ_ORIGINALES, RAIZ_STORAGE, RAIZ_TEMPORAL } from '../../src/config/storage';

describe('configuracion de almacenamiento', () => {
    it('las carpetas son rutas absolutas dentro de la carpeta de almacenamiento', () => {
        for (const ruta of [RAIZ_ORIGINALES, RAIZ_TEMPORAL]) {
            expect(path.isAbsolute(ruta)).toBe(true);
            expect(ruta.startsWith(RAIZ_STORAGE + path.sep)).toBe(true);
        }
    });

    it('originales y temporal son carpetas distintas', () => {
        expect(RAIZ_ORIGINALES).not.toBe(RAIZ_TEMPORAL);
    });

    it('el tamano maximo sale de la configuracion', () => {
        expect(MAX_BYTES).toBe(env.MAX_UPLOAD_MB * 1024 * 1024);
    });

    it('el tamano maximo es positivo y nunca pasa de 500 MB', () => {
        expect(MAX_BYTES).toBeGreaterThan(0);
        expect(MAX_BYTES).toBeLessThanOrEqual(500 * 1024 * 1024);
    });
});