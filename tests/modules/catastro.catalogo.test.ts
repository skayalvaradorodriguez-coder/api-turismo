import { describe, expect, it } from 'vitest';
import {
    CATALOGO_PARROQUIAS,
    claveComparable,
    limpiarEspacios,
    resolverCanton,
    resolverParroquia,
} from '../../src/modules/procesamiento/catastro.catalogo';

describe('catastro.catalogo', () => {
    it('tiene 3 cantones y 16 parroquias oficiales', () => {
        expect(Object.keys(CATALOGO_PARROQUIAS)).toEqual(['LA LIBERTAD', 'SALINAS', 'SANTA ELENA']);
        expect(Object.values(CATALOGO_PARROQUIAS).flat()).toHaveLength(16);
    });

    it('limpiarEspacios deja un solo espacio y quita los extremos', () => {
        expect(limpiarEspacios('  VICENTE   ROCAFUERTE ')).toBe('VICENTE ROCAFUERTE');
    });

    it('claveComparable ignora tildes, mayusculas y signos', () => {
        expect(claveComparable('José Luis  Tamayo')).toBe('JOSE LUIS TAMAYO');
        expect(claveComparable('GRAL. ENRIQUEZ GALLO')).toBe('GRAL ENRIQUEZ GALLO');
    });

    it('cada parroquia oficial se reconoce a si misma en su canton', () => {
        for (const [canton, lista] of Object.entries(CATALOGO_PARROQUIAS)) {
            for (const parroquia of lista) {
                expect(resolverParroquia(canton, parroquia)).toEqual({ estado: 'oficial', valor: parroquia });
            }
        }
    });

    it('espacios sobrantes y tildes faltantes se normalizan sin perder el nombre oficial', () => {
        expect(resolverParroquia('SALINAS', 'VICENTE  ROCAFUERTE')).toEqual({ estado: 'normalizada', valor: 'VICENTE ROCAFUERTE' });
        expect(resolverParroquia('SANTA ELENA', 'COLONCHE ')).toEqual({ estado: 'normalizada', valor: 'COLONCHE' });
        expect(resolverParroquia('SALINAS', 'JOSE LUIS TAMAYO')).toEqual({ estado: 'normalizada', valor: 'JOSÉ LUIS TAMAYO' });
    });

    it('corrige solo los errores de escritura conocidos', () => {
        expect(resolverParroquia('SANTA ELENA', 'MANGLARLTO')).toEqual({ estado: 'corregida', valor: 'MANGLARALTO' });
        expect(resolverParroquia('SALINAS', 'GRAL. ENRIQUEZ GALLO')).toEqual({
            estado: 'corregida',
            valor: 'GENERAL ALBERTO ENRÍQUEZ GALLO',
        });
    });

    it('una parroquia desconocida no se adivina', () => {
        expect(resolverParroquia('SANTA ELENA', 'MANGLARALTA')).toEqual({ estado: 'desconocida', valor: null });
        expect(resolverParroquia('SANTA ELENA', '')).toEqual({ estado: 'desconocida', valor: null });
    });

    it('una parroquia de otro canton no se acepta', () => {
        expect(resolverParroquia('SALINAS', 'COLONCHE')).toEqual({ estado: 'desconocida', valor: null });
    });

    it('con un canton desconocido la parroquia tambien es desconocida', () => {
        expect(resolverParroquia('GUAYAQUIL', 'SALINAS')).toEqual({ estado: 'desconocida', valor: null });
    });

    it('resuelve el canton con las mismas reglas', () => {
        expect(resolverCanton('SALINAS')).toEqual({ estado: 'oficial', valor: 'SALINAS' });
        expect(resolverCanton(' la  libertad ')).toEqual({ estado: 'normalizada', valor: 'LA LIBERTAD' });
        expect(resolverCanton('Quito')).toEqual({ estado: 'desconocida', valor: null });
    });

    it('todas las parroquias y cantones de los datos reales se resuelven', () => {
        const reales: Array<[string, string]> = [
            ['SALINAS', 'GENERAL ALBERTO ENRÍQUEZ GALLO'],
            ['SANTA ELENA', 'SIMÓN BOLÍVAR'],
            ['SANTA ELENA', 'SAN JOSÉ DE ANCÓN'],
            ['SALINAS', 'SANTA ROSA'],
        ];
        for (const [c, p] of reales) expect(resolverParroquia(c, p).estado).toBe('oficial');
    });
});
