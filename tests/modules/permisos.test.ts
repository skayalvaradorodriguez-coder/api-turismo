// Comprueba los permisos reales del usuario de la aplicacion. Requiere haber ejecutado database/008_permisos.sql.
import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/config/db';

afterAll(async () => {
    await pool.end();
});

const DENEGADO = /ACCESS_DENIED/;

/** Ejecuta el SQL y devuelve el codigo del error de MySQL, o null si se permitio. */
async function codigoDeError(sql: string): Promise<string | null> {
    try {
        await pool.query(sql);
    } catch (e) {
        return String((e as { code?: unknown }).code);
    }
    return null;
}

const TABLAS = [
    'roles',
    'usuarios',
    'tokens_usuario',
    'fuentes',
    'estructuras',
    'cargas',
    'carga_metadatos',
    'archivos_originales',
    'bitacora',
];

describe('permisos del usuario de la aplicacion', () => {
    it.each(TABLAS)('puede leer la tabla %s', async (tabla) => {
        expect(await codigoDeError(`SELECT 1 FROM ${tabla} LIMIT 1`)).toBeNull();
    });

    it('la bitacora no se puede editar ni borrar', async () => {
        expect(await codigoDeError('UPDATE bitacora SET accion = accion WHERE 1 = 0')).toMatch(DENEGADO);
        expect(await codigoDeError('DELETE FROM bitacora WHERE 1 = 0')).toMatch(DENEGADO);
    });

    it('los archivos originales no se borran y solo se puede cambiar "vigente"', async () => {
        expect(await codigoDeError('DELETE FROM archivos_originales WHERE 1 = 0')).toMatch(DENEGADO);
        expect(await codigoDeError("UPDATE archivos_originales SET sha256 = 'x' WHERE 1 = 0")).toMatch(DENEGADO);
        expect(await codigoDeError('UPDATE archivos_originales SET vigente = vigente WHERE 1 = 0')).toBeNull();
    });

    it('fuentes y cargas no se borran', async () => {
        expect(await codigoDeError('DELETE FROM fuentes WHERE 1 = 0')).toMatch(DENEGADO);
        expect(await codigoDeError('DELETE FROM cargas WHERE 1 = 0')).toMatch(DENEGADO);
    });

    it('no puede crear ni alterar tablas', async () => {
        expect(await codigoDeError('CREATE TABLE zz_prueba_permiso (id INT)')).toMatch(DENEGADO);
        expect(await codigoDeError("ALTER TABLE fuentes COMMENT = ''")).toMatch(DENEGADO);
    });
});