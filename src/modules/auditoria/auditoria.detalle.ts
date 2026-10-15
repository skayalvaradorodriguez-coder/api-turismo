// Prepara el campo "detalle" de la bitacora: oculta datos sensibles y limita su tamano.

const CLAVE_SENSIBLE = /pass|clave|token|secret|hash|credential|cookie/i;
const MAX_TEXTO = 500;
const MAX_PROFUNDIDAD = 4;
const MAX_ELEMENTOS = 50;
const MAX_JSON = 4000;

function limpiar(valor: unknown, nivel: number): unknown {
    if (typeof valor === 'string') return valor.length > MAX_TEXTO ? `${valor.slice(0, MAX_TEXTO)}...` : valor;
    if (valor === null || typeof valor === 'number' || typeof valor === 'boolean') return valor;
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor !== 'object') return undefined; // funciones, simbolos, bigint: se descartan
    if (nivel >= MAX_PROFUNDIDAD) return '[omitido]'; // tambien corta las referencias circulares

    if (Array.isArray(valor)) return valor.slice(0, MAX_ELEMENTOS).map((v) => limpiar(v, nivel + 1));

    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor)) {
        salida[clave] = CLAVE_SENSIBLE.test(clave) ? '[OCULTO]' : limpiar(v, nivel + 1);
    }
    return salida;
}

/** Devuelve el JSON listo para guardar, o null si no hay detalle. */
export function detalleAJson(detalle?: Record<string, unknown> | null): string | null {
    if (!detalle) return null;
    const json = JSON.stringify(limpiar(detalle, 0));
    return json.length > MAX_JSON ? JSON.stringify({ truncado: true }) : json;
}