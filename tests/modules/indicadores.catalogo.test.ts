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

describe('indicadores de Carnaval (kobo_carnaval_v1)', () => {
    const K = 'kobo_carnaval_v1';
    const registros: RegistroDatos[] = [
        { sexo: 'Mujer', cal_seguridad: 5, nps_volver: 4, atr_sol_playa: '1', atr_ciudad: '0', gasto_alojamiento: 'De $21 a $50' },
        { sexo: 'Hombre', cal_seguridad: 3, nps_volver: null, atr_sol_playa: '1', atr_ciudad: '1', gasto_alojamiento: 'Menos de $20' },
        { sexo: null, cal_seguridad: null, nps_volver: 5, atr_sol_playa: '0', atr_ciudad: '0', gasto_alojamiento: 'De $21 a $50' },
        { sexo: 'Mujer', cal_seguridad: 4, nps_volver: 5, atr_sol_playa: '0', atr_ciudad: '0', gasto_alojamiento: 'Más de $100' },
    ];

    it('tiene ids propios y solo se calcula para su estructura', () => {
        const ids = calcularIndicadores(K, []).map((i) => i.id);
        expect(ids[0]).toBe('C1');
        expect(ids.every((id) => id.startsWith('C'))).toBe(true);
        expect(calcularIndicadores('ots_turista_v1', []).some((i) => i.id.startsWith('C'))).toBe(false);
    });

    it('cuenta encuestas y reparte por categoria sin contar los vacios', () => {
        expect(calc(K, registros, 'C1').valor).toBe(4);
        const genero = calc(K, registros, 'C2');
        expect(genero.registrosUsados).toBe(3);
        expect(genero.registrosExcluidos).toBe(1);
        expect(genero.distribucion).toEqual([
            { categoria: 'Mujer', n: 2, porcentaje: 66.7 },
            { categoria: 'Hombre', n: 1, porcentaje: 33.3 },
        ]);
    });

    it('el promedio de una calificacion excluye las sin respuesta', () => {
        const seguridad = calcularIndicadores(K, registros).find((i) => i.nombre === 'Calificación de la seguridad');
        expect(seguridad?.valor).toBe(4);
        expect(seguridad?.registrosUsados).toBe(3);
        expect(seguridad?.registrosExcluidos).toBe(1);
    });

    it('la seleccion multiple da el porcentaje de encuestados que marco cada opcion', () => {
        const atracciones = calcularIndicadores(K, registros).find((i) => i.nombre === 'Atracciones de interés');
        const solPlaya = atracciones?.distribucion?.find((d) => d.categoria === 'Sol y playa');
        const ciudad = atracciones?.distribucion?.find((d) => d.categoria === 'Ciudad');
        expect(solPlaya).toEqual({ categoria: 'Sol y playa', n: 2, porcentaje: 50 });
        expect(ciudad).toEqual({ categoria: 'Ciudad', n: 1, porcentaje: 25 });
        expect(atracciones?.respuestaMultiple).toBe(true);
        expect(atracciones?.registrosUsados).toBe(4);
        expect(atracciones?.descripcion).toContain('no suman 100');
    });

    it('el gasto se muestra por rango, sin convertirlo a numero, y con su aclaracion', () => {
        const gasto = calcularIndicadores(K, registros).find((i) => i.nombre === 'Gasto en alojamiento');
        expect(gasto?.valor).toBeNull();
        expect(gasto?.respuestaMultiple).toBeUndefined();
        expect(gasto?.distribucion?.[0]).toEqual({ categoria: 'De $21 a $50', n: 2, porcentaje: 50 });
        expect(gasto?.advertencia).toBeDefined();
    });

    it('con cero registros no inventa valores', () => {
        for (const i of calcularIndicadores(K, []).filter((x) => x.id !== 'C1')) {
            expect(i.valor === null || i.valor === 0).toBe(true);
            expect(i.registrosUsados).toBe(0);
        }
    });
});

describe('indicadores de Semana Santa (kobo_semana_santa_v1)', () => {
    const K = 'kobo_semana_santa_v1';
    const SA = 'SECCIÓN A. PERFIL SOCIODEMOGRÁFICO/';
    const SC = 'SECCIÓN C. ESTRUCTURA DE CONSUMO/';
    const seguridad = `${SC}Pregunta_019/Seguridad percibida durante\nsu estancia  `; // encabezado con salto de linea y espacios duros
    const registros: RegistroDatos[] = [
        { [`${SA}Pregunta`]: '25 a 34 años', [seguridad]: 4, [`${SC}Pregunta.6`]: '4 - Probable', 'SECCIÓN B. PLANEACIÓN DEL VIAJE/Pregunta.2': 'Sol y playa Gastronomía', Q2_Destinos_Afluencia_Moderada: 'Puerto Luicía Playa La Liberta' },
        { [`${SA}Pregunta`]: '35 a 44 años', [seguridad]: 2, [`${SC}Pregunta.6`]: '5 - Muy probable', 'SECCIÓN B. PLANEACIÓN DEL VIAJE/Pregunta.2': 'Sol y playa', Q2_Destinos_Afluencia_Moderada: null },
        { [`${SA}Pregunta`]: '25 a 34 años', [seguridad]: null, [`${SC}Pregunta.6`]: '4 - Probable', 'SECCIÓN B. PLANEACIÓN DEL VIAJE/Pregunta.2': 'Prefiero no responder', Q2_Destinos_Afluencia_Moderada: 'Dos Mangas' },
    ];

    it('lee las columnas aunque el encabezado traiga saltos de linea o espacios duros', () => {
        const r = calcularIndicadores(K, registros).find((i) => i.nombre === 'Calificación de la seguridad');
        expect(r?.valor).toBe(3);
        expect(r?.registrosUsados).toBe(2);
        expect(calcularIndicadores(K, registros).every((i) => i.id.startsWith('S'))).toBe(true);
    });

    it('reparte por edad y por probabilidad de recomendar', () => {
        const edad = calcularIndicadores(K, registros).find((i) => i.nombre === 'Distribución por edad');
        expect(edad?.distribucion?.[0]).toEqual({ categoria: '25 a 34 años', n: 2, porcentaje: 66.7 });
        const rec = calcularIndicadores(K, registros).find((i) => i.nombre === 'Probabilidad de recomendar');
        expect(rec?.distribucion?.[0]).toEqual({ categoria: '4 - Probable', n: 2, porcentaje: 66.7 });
    });

    it('cuenta las opciones mencionadas en un texto con varias respuestas, sin contar "Prefiero no responder"', () => {
        const atr = calcularIndicadores(K, registros).find((i) => i.nombre === 'Atracciones de interés');
        expect(atr?.registrosUsados).toBe(2);
        expect(atr?.respuestaMultiple).toBe(true);
        expect(atr?.distribucion?.find((d) => d.categoria === 'Sol y playa')).toEqual({ categoria: 'Sol y playa', n: 2, porcentaje: 100 });
        expect(atr?.distribucion?.find((d) => d.categoria === 'Gastronomía')).toEqual({ categoria: 'Gastronomía', n: 1, porcentaje: 50 });
    });

    it('reconoce los destinos aunque vengan con errores de escritura', () => {
        const q2 = calcularIndicadores(K, registros).find((i) => i.nombre === 'Destinos de afluencia moderada visitados');
        expect(q2?.registrosUsados).toBe(2);
        expect(q2?.distribucion?.find((d) => d.categoria === 'Puerto Lucía')?.n).toBe(1);
        expect(q2?.distribucion?.find((d) => d.categoria === 'Playa La Libertad')?.n).toBe(1);
        expect(q2?.distribucion?.find((d) => d.categoria === 'Dos Mangas')?.n).toBe(1);
    });
});
