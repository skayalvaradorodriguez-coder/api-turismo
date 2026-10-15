import { describe, expect, it } from 'vitest';
import { detalleAJson } from '../../src/modules/auditoria/auditoria.detalle';

describe('detalleAJson', () => {
    it('devuelve null si no hay detalle', () => {
        expect(detalleAJson()).toBeNull();
        expect(detalleAJson(null)).toBeNull();
    });

    it('conserva los datos normales', () => {
        const json = detalleAJson({ estado_anterior: 'recibida', estado_nuevo: 'validada', sha256: 'abc123' }) as string;
        expect(JSON.parse(json)).toEqual({ estado_anterior: 'recibida', estado_nuevo: 'validada', sha256: 'abc123' });
    });

    it('oculta claves sensibles, tambien dentro de objetos anidados', () => {
        const json = detalleAJson({
            password: 'valor-secreto-1',
            datos: { token: 'valor-secreto-2', tokenHash: 'valor-secreto-3', nombre: 'Ana' },
        }) as string;
        expect(json).not.toContain('valor-secreto');
        expect(JSON.parse(json)).toEqual({
            password: '[OCULTO]',
            datos: { token: '[OCULTO]', tokenHash: '[OCULTO]', nombre: 'Ana' },
        });
    });

    it('recorta los textos muy largos', () => {
        const json = detalleAJson({ nota: 'x'.repeat(2000) }) as string;
        const nota = (JSON.parse(json) as { nota: string }).nota;
        expect(nota.length).toBe(503);
    });

    it('no se rompe con referencias circulares', () => {
        const a: Record<string, unknown> = {};
        a['yo'] = a;
        expect(() => detalleAJson(a)).not.toThrow();
    });

    it('si el detalle es demasiado grande guarda solo una marca', () => {
        const grande: Record<string, unknown> = {};
        for (let i = 0; i < 100; i++) grande[`campo${i}`] = 'y'.repeat(400);
        expect(JSON.parse(detalleAJson(grande) as string)).toEqual({ truncado: true });
    });
});