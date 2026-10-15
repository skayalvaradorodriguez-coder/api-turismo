import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { procesarCatastro } from '../../src/modules/procesamiento/catastro.reglas';

// Prueba con el archivo real del Catastro. Solo se ejecuta si se indica donde esta:
//   $env:CATASTRO_CSV = "C:\ruta\santa_elena.csv"
// Sin esa variable se omite, para que las pruebas normales no dependan de un archivo externo.
const ruta = process.env['CATASTRO_CSV'];

describe.skipIf(ruta === undefined || ruta === '')('procesarCatastro con el archivo real', () => {
    it('las 962 filas se aceptan, sin errores, con las alertas esperadas', () => {
        const r = procesarCatastro(readFileSync(ruta as string, 'utf8'));
        const por: Record<string, number> = {};
        for (const h of r.hallazgos) por[`${h.severidad}:${h.regla}`] = (por[`${h.severidad}:${h.regla}`] ?? 0) + 1;

        expect(r.totalFilas).toBe(962);
        expect(r.totalErrores).toBe(0);
        expect(r.registros).toHaveLength(962);
        expect(por).toEqual({
            'alerta:espacios_extra': 37,
            'alerta:categoria_normalizada': 33,
            'alerta:categoria_uno': 15,
            'alerta:pendiente_inspeccion': 8,
            'alerta:nombre_vacio': 6,
            'alerta:parroquia_corregida': 2,
            'alerta:posible_duplicado': 13,
        });
        expect(new Set(r.registros.map((x) => x.numeroRegistro)).size).toBe(962);
        expect(new Set(r.registros.map((x) => x.parroquia)).size).toBe(16);
    });
});
