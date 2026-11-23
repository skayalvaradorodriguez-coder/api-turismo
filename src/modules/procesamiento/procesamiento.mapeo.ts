import type { RespuestaServicio } from './procesamiento.cliente';
import type { Hallazgo } from './procesamiento.repository';

const MENSAJES_CAMBIO: Record<string, string> = {
    cero_a_faltante: 'El 0 se interpreta como sin respuesta y se deja vacio',
    pais_corregido: 'Pais corregido (error de escritura o gentilicio)',
    pais_deducido_de_lugar: 'Pais deducido a partir de la ciudad o provincia indicada',
    pais_no_reconocido: 'Pais no reconocido: se deja como vino',
    campo_calculado: 'Campo calculado a partir de otros',
    valor_no_numerico: 'El valor no es numerico y se deja vacio',
};

const corto = (valor: string | null, largo: number): string | null => (valor === null ? null : valor.slice(0, largo));

/**
 * Convierte la respuesta del servicio en filas de la tabla hallazgos:
 * - lo que la validacion encontro (error o alerta),
 * - cada transformacion aplicada ("cambio", con valor original y nuevo),
 * - las alertas de la normalizacion.
 * Un "cambio" cuyo valor no cambio (por ejemplo, un pais no reconocido) es solo una observacion: se guarda como alerta.
 */
export function aHallazgos(r: RespuestaServicio): { hallazgos: Hallazgo[]; alertasDeNormalizacion: number } {
    const hallazgos: Hallazgo[] = r.hallazgos.map((h) => ({
        fila: h.fila,
        columna: h.columna,
        regla: h.regla,
        severidad: h.severidad,
        mensaje: h.mensaje.slice(0, 300),
        valorOriginal: corto(h.valor_original, 300),
        valorCorregido: corto(h.valor_corregido, 300),
    }));

    let alertasDeNormalizacion = 0;
    for (const c of r.cambios) {
        const nuevo = c.valor_nuevo === null ? null : String(c.valor_nuevo);
        const sinCambio = nuevo !== null && nuevo === c.valor_original;
        if (sinCambio) alertasDeNormalizacion++;
        hallazgos.push({
            fila: c.fila,
            columna: c.columna,
            regla: c.regla,
            severidad: sinCambio ? 'alerta' : 'cambio',
            mensaje: MENSAJES_CAMBIO[c.regla] ?? `Valor modificado por la regla ${c.regla}`,
            valorOriginal: corto(c.valor_original, 300),
            valorCorregido: corto(nuevo, 300),
        });
    }
    for (const a of r.alertas_normalizacion) {
        alertasDeNormalizacion++;
        hallazgos.push({ fila: a.fila, columna: a.columna, regla: a.regla, severidad: 'alerta', mensaje: a.mensaje.slice(0, 300), valorOriginal: null, valorCorregido: null });
    }
    if (r.hallazgos_truncados || r.cambios_truncados) {
        alertasDeNormalizacion++;
        hallazgos.push({
            fila: null,
            columna: null,
            regla: 'hallazgos_truncados',
            severidad: 'alerta',
            mensaje: 'Hay mas hallazgos de los que el servicio entrega; solo se guardan los primeros',
            valorOriginal: null,
            valorCorregido: null,
        });
    }
    return { hallazgos, alertasDeNormalizacion };
}
