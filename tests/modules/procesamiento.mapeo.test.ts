import { describe, expect, it } from 'vitest';
import type { RespuestaServicio } from '../../src/modules/procesamiento/procesamiento.cliente';
import { aHallazgos } from '../../src/modules/procesamiento/procesamiento.mapeo';

const base = (c: Partial<RespuestaServicio> = {}): RespuestaServicio => ({
    estructura: { codigo: 'ots_turista_v1', nombre: 'x' },
    formato: 'csv',
    hoja: null,
    resumen: { filas_leidas: 2, filas_validas: 2, filas_excluidas: 0, errores: 0, alertas: 0 },
    hallazgos: [],
    hallazgos_truncados: false,
    cambios: [],
    cambios_truncados: false,
    alertas_normalizacion: [],
    registros: [],
    ...c,
});

describe('aHallazgos', () => {
    it('conserva los hallazgos de la validacion', () => {
        const r = aHallazgos(base({ hallazgos: [{ fila: 3, columna: 'id', regla: 'identificador_repetido', severidad: 'error', mensaje: 'm', valor_original: '1', valor_corregido: null }] }));
        expect(r.hallazgos).toEqual([{ fila: 3, columna: 'id', regla: 'identificador_repetido', severidad: 'error', mensaje: 'm', valorOriginal: '1', valorCorregido: null }]);
        expect(r.alertasDeNormalizacion).toBe(0);
    });

    it('un cambio queda como severidad "cambio" con valor original y nuevo (numeros como texto)', () => {
        const r = aHallazgos(base({ cambios: [{ fila: 2, columna: 'edad', regla: 'cero_a_faltante', valor_original: '0', valor_nuevo: null }, { fila: 2, columna: 'ocupacion_calculada', regla: 'campo_calculado', valor_original: null, valor_nuevo: 30.5 }] }));
        expect(r.hallazgos[0]).toMatchObject({ severidad: 'cambio', valorOriginal: '0', valorCorregido: null });
        expect(r.hallazgos[1]).toMatchObject({ severidad: 'cambio', valorOriginal: null, valorCorregido: '30.5' });
        expect(r.alertasDeNormalizacion).toBe(0);
    });

    it('un "cambio" que no cambia el valor es una alerta, y las alertas de normalizacion se cuentan', () => {
        const r = aHallazgos(base({
            cambios: [{ fila: 5, columna: 'pais_residencia', regla: 'pais_no_reconocido', valor_original: 'Marlon', valor_nuevo: 'Marlon' }],
            alertas_normalizacion: [{ fila: 6, columna: 'habitaciones_disponibles', regla: 'sin_habitaciones_disponibles', mensaje: 'm' }],
        }));
        expect(r.hallazgos.map((h) => h.severidad)).toEqual(['alerta', 'alerta']);
        expect(r.alertasDeNormalizacion).toBe(2);
    });

    it('recorta los textos largos a lo que admite la tabla y avisa si el servicio trunco', () => {
        const largo = 'x'.repeat(500);
        const r = aHallazgos(base({ hallazgos_truncados: true, hallazgos: [{ fila: null, columna: null, regla: 'r', severidad: 'alerta', mensaje: largo, valor_original: largo, valor_corregido: null }] }));
        expect(r.hallazgos[0]?.mensaje).toHaveLength(300);
        expect(r.hallazgos[0]?.valorOriginal).toHaveLength(300);
        expect(r.hallazgos.at(-1)).toMatchObject({ regla: 'hallazgos_truncados', severidad: 'alerta' });
    });
});
