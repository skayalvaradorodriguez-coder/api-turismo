import { describe, expect, it } from 'vitest';
import {
    actualizarMetadatosSchema,
    archivoParamSchema,
    crearCargaSchema,
    idCargaParamSchema,
    listarCargasQuerySchema,
    rechazarCargaSchema,
} from '../../src/modules/cargas/cargas.schemas';

describe('crearCargaSchema', () => {
    it('acepta lo minimo (solo la fuente) y completa los valores por defecto', () => {
        const r = crearCargaSchema.safeParse({ fuenteId: '3' });
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.fuenteId).toBe(3);
            expect(r.data.nivelIngreso).toBe(1);
            expect(r.data.metadatos).toEqual({});
            expect(r.data.descripcion).toBeNull();
            expect(r.data.estructuraId).toBeUndefined();
            expect(r.data.periodoDesde).toBeUndefined();
        }
    });

    it('acepta todos los campos tal como llegan de un formulario (todo texto)', () => {
        const r = crearCargaSchema.safeParse({
            fuenteId: '3',
            estructuraId: '2',
            descripcion: '  Feriado de Carnaval 2026  ',
            periodoDesde: '2026-02-14',
            periodoHasta: '2026-02-18',
            nivelIngreso: '2',
            metadatos: JSON.stringify({ 'Tamaño de muestra': 385, cobertura: 'Provincia' }),
        });
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data).toEqual({
                fuenteId: 3,
                estructuraId: 2,
                descripcion: 'Feriado de Carnaval 2026',
                periodoDesde: '2026-02-14',
                periodoHasta: '2026-02-18',
                nivelIngreso: 2,
                metadatos: { 'Tamaño de muestra': '385', cobertura: 'Provincia' },
            });
        }
    });

    it('los campos vacios del formulario se tratan como no enviados', () => {
        const r = crearCargaSchema.safeParse({
            fuenteId: '3',
            estructuraId: '',
            descripcion: '   ',
            periodoDesde: '',
            periodoHasta: '',
            nivelIngreso: '',
            metadatos: '',
        });
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.estructuraId).toBeUndefined();
            expect(r.data.descripcion).toBeNull();
            expect(r.data.periodoDesde).toBeUndefined();
            expect(r.data.nivelIngreso).toBe(1);
            expect(r.data.metadatos).toEqual({});
        }
    });

    it('rechaza una fuente que falta o no es valida', () => {
        expect(crearCargaSchema.safeParse({}).success).toBe(false);
        for (const fuenteId of ['abc', '0', '-1', '1.5', '']) {
            expect(crearCargaSchema.safeParse({ fuenteId }).success, `fuenteId=${fuenteId}`).toBe(false);
        }
    });

    it('rechaza fechas que no existen o con otro formato', () => {
        for (const fecha of ['2026-13-01', '2026-02-30', '01/02/2026', '2026-2-1', 'ayer']) {
            expect(crearCargaSchema.safeParse({ fuenteId: '1', periodoDesde: fecha }).success, fecha).toBe(false);
        }
    });

    it('el fin del periodo no puede ser anterior al inicio (iguales si se acepta)', () => {
        const mal = crearCargaSchema.safeParse({ fuenteId: '1', periodoDesde: '2026-05-10', periodoHasta: '2026-05-01' });
        expect(mal.success).toBe(false);
        const igual = crearCargaSchema.safeParse({ fuenteId: '1', periodoDesde: '2026-05-01', periodoHasta: '2026-05-01' });
        expect(igual.success).toBe(true);
    });

    it('el nivel de ingreso debe estar entre 1 y 3', () => {
        for (const nivel of ['0', '4', 'x', '1.5']) {
            expect(crearCargaSchema.safeParse({ fuenteId: '1', nivelIngreso: nivel }).success, nivel).toBe(false);
        }
        expect(crearCargaSchema.safeParse({ fuenteId: '1', nivelIngreso: '3' }).success).toBe(true);
    });

    it('rechaza campos que no existen, como estado o cargadoPor', () => {
        expect(crearCargaSchema.safeParse({ fuenteId: '1', estado: 'publicada' }).success).toBe(false);
        expect(crearCargaSchema.safeParse({ fuenteId: '1', cargadoPor: '5' }).success).toBe(false);
    });

    it('rechaza una descripcion demasiado larga', () => {
        expect(crearCargaSchema.safeParse({ fuenteId: '1', descripcion: 'x'.repeat(2001) }).success).toBe(false);
    });
});

describe('metadatos al crear una carga', () => {
    const conMetadatos = (metadatos: unknown) => crearCargaSchema.safeParse({ fuenteId: '1', metadatos });

    it('convierte numeros y booleanos a texto', () => {
        const r = conMetadatos('{"muestra":385,"completo":true}');
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.metadatos).toEqual({ muestra: '385', completo: 'true' });
    });

    it('rechaza un JSON mal formado o que no es un objeto', () => {
        for (const texto of ['{malo', 'hola', '[1,2]', 'null', '"x"', '5']) {
            expect(conMetadatos(texto).success, texto).toBe(false);
        }
    });

    it('rechaza nombres peligrosos o invalidos', () => {
        const malos = ['__proto__', 'constructor', 'prototype', 'con<script>', 'a ', '_oculto', 'x'.repeat(81)];
        for (const nombre of malos) {
            const texto = `{${JSON.stringify(nombre)}:"valor"}`;
            expect(conMetadatos(texto).success, nombre).toBe(false);
        }
        expect(conMetadatos('{"":"valor"}').success).toBe(false);
    });

    it('rechaza mas de 50 pares, valores muy largos, vacios o anidados', () => {
        const muchos: Record<string, string> = {};
        for (let i = 0; i < 51; i++) muchos[`clave${i}`] = 'v';
        expect(conMetadatos(JSON.stringify(muchos)).success).toBe(false);
        expect(conMetadatos(JSON.stringify({ a: 'x'.repeat(1001) })).success).toBe(false);
        expect(conMetadatos('{"a":"   "}').success).toBe(false);
        expect(conMetadatos('{"a":{"b":1}}').success).toBe(false);
        expect(conMetadatos('{"a":null}').success).toBe(false);
    });
});

describe('rechazarCargaSchema', () => {
    it('acepta un motivo con texto', () => {
        const r = rechazarCargaSchema.safeParse({ motivo: '  El archivo esta incompleto  ' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.motivo).toBe('El archivo esta incompleto');
    });

    it('rechaza motivo ausente, corto, largo o campos de mas', () => {
        expect(rechazarCargaSchema.safeParse({}).success).toBe(false);
        expect(rechazarCargaSchema.safeParse({ motivo: 'no' }).success).toBe(false);
        expect(rechazarCargaSchema.safeParse({ motivo: 'x'.repeat(1001) }).success).toBe(false);
        expect(rechazarCargaSchema.safeParse({ motivo: 'Motivo valido', estado: 'publicada' }).success).toBe(false);
    });
});

describe('actualizarMetadatosSchema', () => {
    it('acepta un objeto con pares', () => {
        const r = actualizarMetadatosSchema.safeParse({ metadatos: { cobertura: 'Provincia', muestra: 385 } });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.metadatos).toEqual({ cobertura: 'Provincia', muestra: '385' });
    });

    it('rechaza un objeto vacio, que falte la clave o campos de mas', () => {
        expect(actualizarMetadatosSchema.safeParse({ metadatos: {} }).success).toBe(false);
        expect(actualizarMetadatosSchema.safeParse({}).success).toBe(false);
        expect(actualizarMetadatosSchema.safeParse({ metadatos: { a: '1' }, extra: 1 }).success).toBe(false);
    });
});

describe('listarCargasQuerySchema', () => {
    it('sin filtros usa limite 50 y pagina 1', () => {
        const r = listarCargasQuerySchema.safeParse({});
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual({ limite: 50, pagina: 1 });
    });

    it('convierte los filtros que llegan como texto', () => {
        const r = listarCargasQuerySchema.safeParse({ fuenteId: '3', estado: 'recibida', limite: '10', pagina: '2' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual({ fuenteId: 3, estado: 'recibida', limite: 10, pagina: 2 });
    });

    it('rechaza valores invalidos', () => {
        const malos = [{ limite: '0' }, { limite: '201' }, { pagina: '0' }, { estado: 'borrada' }, { fuenteId: 'abc' }];
        for (const consulta of malos) {
            expect(listarCargasQuerySchema.safeParse(consulta).success, JSON.stringify(consulta)).toBe(false);
        }
    });
});

describe('parametros de la URL', () => {
    it('el id de la carga debe ser un entero positivo', () => {
        const r = idCargaParamSchema.safeParse({ id: '5' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.id).toBe(5);
        for (const id of ['abc', '0', '-2', '1.5']) {
            expect(idCargaParamSchema.safeParse({ id }).success, id).toBe(false);
        }
    });

    it('el archivo necesita el id de la carga y el del archivo', () => {
        const r = archivoParamSchema.safeParse({ id: '5', archivoId: '7' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual({ id: 5, archivoId: 7 });
        expect(archivoParamSchema.safeParse({ id: '5' }).success).toBe(false);
        expect(archivoParamSchema.safeParse({ id: '5', archivoId: 'x' }).success).toBe(false);
    });
});