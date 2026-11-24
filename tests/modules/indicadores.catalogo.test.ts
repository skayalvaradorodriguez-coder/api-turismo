import { describe, expect, it } from 'vitest';
import { CATALOGO, calcularIndicadores } from '../../src/modules/indicadores/indicadores.catalogo';
import type { RegistroDatos } from '../../src/modules/indicadores/indicadores.catalogo';

const calc = (estructura: string, registros: RegistroDatos[], id: string) => {
    const r = calcularIndicadores(estructura, registros).find((x) => x.id === id);
    if (!r) throw new Error(`No existe el indicador ${id}`);
    return r;
};

describe('catalogo', () => {
    it('cada indicador tiene id unico, nombre y descripcion', () => {
        const ids = CATALOGO.map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const i of CATALOGO) {
            expect(i.nombre.length).toBeGreaterThan(0);
            expect(i.descripcion.length).toBeGreaterThan(0);
        }
    });

    it('solo calcula los indicadores de la estructura pedida', () => {
        const ids = calcularIndicadores('ots_hotel_v1', []).map((i) => i.id);
        expect(ids).toEqual(['H1', 'H2', 'H3']);
        expect(calcularIndicadores('otra_estructura', [])).toEqual([]);
    });

    it('con cero registros no inventa valores', () => {
        const t = calc('ots_turista_v1', [], 'T3');
        expect(t.valor).toBeNull();
        expect(t.registrosUsados).toBe(0);
        expect(calc('ots_hotel_v1', [], 'H2').valor).toBeNull();
    });
});

describe('indicadores de turistas', () => {
    const turistas: RegistroDatos[] = [
        { genero: 'Femenino', edad: 30, pais_residencia: 'Ecuador', motivo_visita: 'Descanso', noches_estadia: 2, gasto_total: 100, nivel_satisfaccion: 5 },
        { genero: 'Masculino', edad: 40, pais_residencia: 'Ecuador', motivo_visita: 'Descanso', noches_estadia: 0, gasto_total: 200, nivel_satisfaccion: 4 },
        { genero: 'Femenino', edad: null, pais_residencia: 'Colombia', motivo_visita: 'Negocios', noches_estadia: 3, gasto_total: 0, nivel_satisfaccion: null },
        { genero: 'Prefiero no responder', edad: 50, pais_residencia: 'Prefiero no responder', motivo_visita: '', noches_estadia: 1, gasto_total: 300, nivel_satisfaccion: 3 },
    ];

    it('T1 cuenta todos los registros', () => {
        expect(calc('ots_turista_v1', turistas, 'T1').valor).toBe(4);
    });

    it('T2 reparte por genero y suma 100 %', () => {
        const r = calc('ots_turista_v1', turistas, 'T2');
        expect(r.distribucion).toEqual([
            { categoria: 'Femenino', n: 2, porcentaje: 50 },
            { categoria: 'Masculino', n: 1, porcentaje: 25 },
            { categoria: 'Prefiero no responder', n: 1, porcentaje: 25 },
        ]);
    });

    it('T3 promedia la edad sin contar los que no respondieron', () => {
        const r = calc('ots_turista_v1', turistas, 'T3');
        expect(r.valor).toBe(40); // (30 + 40 + 50) / 3
        expect(r.registrosUsados).toBe(3);
        expect(r.registrosExcluidos).toBe(1);
    });

    it('T4 calcula el porcentaje de residentes en Ecuador sin contar a quien no respondio', () => {
        const r = calc('ots_turista_v1', turistas, 'T4');
        expect(r.valor).toBe(66.7); // 2 de 3
        expect(r.registrosUsados).toBe(3);
        expect(r.registrosExcluidos).toBe(1);
        expect(r.distribucion?.[0]).toEqual({ categoria: 'Ecuador', n: 2, porcentaje: 66.7 });
    });

    it('T5 deja fuera el motivo vacio', () => {
        const r = calc('ots_turista_v1', turistas, 'T5');
        expect(r.registrosUsados).toBe(3);
        expect(r.registrosExcluidos).toBe(1);
    });

    it('T8 incluye los 0 noches y lo advierte', () => {
        const r = calc('ots_turista_v1', turistas, 'T8');
        expect(r.valor).toBe(1.5); // (2 + 0 + 3 + 1) / 4
        expect(r.advertencia).toBeTruthy();
    });

    it('T9 promedia el gasto reportado y lo advierte', () => {
        const r = calc('ots_turista_v1', turistas, 'T9');
        expect(r.valor).toBe(150); // (100 + 200 + 0 + 300) / 4
        expect(r.advertencia).toBeTruthy();
    });

    it('T10 promedia la satisfaccion sin los faltantes', () => {
        const r = calc('ots_turista_v1', turistas, 'T10');
        expect(r.valor).toBe(4); // (5 + 4 + 3) / 3
        expect(r.registrosExcluidos).toBe(1);
    });
});

describe('indicadores de hoteles', () => {
    const hoteles: RegistroDatos[] = [
        { id_hotel: 1, habitaciones_ocupadas: 5, habitaciones_disponibles: 10, total_turistas: 10, checkin_nacionales: 8, checkin_extranjeros: 2 },
        { id_hotel: 1, habitaciones_ocupadas: 10, habitaciones_disponibles: 10, total_turistas: 20, checkin_nacionales: 10, checkin_extranjeros: 10 },
        { id_hotel: 2, habitaciones_ocupadas: 12, habitaciones_disponibles: 10, total_turistas: 5, checkin_nacionales: 5, checkin_extranjeros: 1 }, // ocupadas > disponibles; no suma
        { id_hotel: 3, habitaciones_ocupadas: 0, habitaciones_disponibles: 0, total_turistas: 0, checkin_nacionales: 0, checkin_extranjeros: 0 }, // sin habitaciones
    ];

    it('H1 cuenta hoteles distintos', () => {
        expect(calc('ots_hotel_v1', hoteles, 'H1').valor).toBe(3);
    });

    it('H2 pondera la ocupacion y excluye los registros incoherentes', () => {
        const r = calc('ots_hotel_v1', hoteles, 'H2');
        expect(r.valor).toBe(75); // (5 + 10) / (10 + 10);
        expect(r.registrosUsados).toBe(2);
        expect(r.registrosExcluidos).toBe(2);
    });

    it('H2 no es el promedio simple de porcentajes', () => {
        const r = calc('ots_hotel_v1', [
            { habitaciones_ocupadas: 1, habitaciones_disponibles: 2 }, // 50 %
            { habitaciones_ocupadas: 10, habitaciones_disponibles: 10 }, // 100 %
        ], 'H2');
        expect(r.valor).toBe(91.67); // 11 / 12; el promedio simple daria 75
    });

    it('H3 suma turistas solo donde nacionales + extranjeros coinciden con el total', () => {
        const r = calc('ots_hotel_v1', hoteles, 'H3');
        expect(r.valor).toBe(30 + 0); // filas 1, 2 y 4 son coherentes: 10 + 20 + 0
        expect(r.distribucion).toEqual([
            { categoria: 'Nacionales', n: 18, porcentaje: 60 },
            { categoria: 'Extranjeros', n: 12, porcentaje: 40 },
        ]);
        expect(r.registrosExcluidos).toBe(1);
    });
});
