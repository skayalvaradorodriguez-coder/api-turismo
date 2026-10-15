import { describe, expect, it } from 'vitest';
import { leerCsv } from '../../src/modules/procesamiento/catastro.csv';

describe('leerCsv', () => {
    it('lee filas simples con saltos de linea LF y CRLF', () => {
        expect(leerCsv('a,b\n1,2\r\n3,4')).toEqual([
            ['a', 'b'],
            ['1', '2'],
            ['3', '4'],
        ]);
    });

    it('quita la marca BOM del inicio', () => {
        expect(leerCsv('\uFEFFRUC,Nombre\n1,x')[0]).toEqual(['RUC', 'Nombre']);
    });

    it('respeta comillas con comas, comillas dobles y saltos de linea dentro del campo', () => {
        expect(leerCsv('a,b\n"Hola, mundo","dijo ""si"""\n"dos\nlineas",x')).toEqual([
            ['a', 'b'],
            ['Hola, mundo', 'dijo "si"'],
            ['dos\nlineas', 'x'],
        ]);
    });

    it('conserva los campos vacios y los espacios', () => {
        expect(leerCsv('a,b,c\n1,,  3 ')).toEqual([
            ['a', 'b', 'c'],
            ['1', '', '  3 '],
        ]);
    });

    it('descarta lineas vacias, incluida la ultima', () => {
        expect(leerCsv('a\n\n1\n\n')).toEqual([['a'], ['1']]);
        expect(leerCsv('')).toEqual([]);
    });
});
