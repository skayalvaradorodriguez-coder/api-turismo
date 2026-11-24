// Catalogo de indicadores. Cada indicador es una definicion (que es, de que estructura sale y
// como se calcula). Son funciones puras sobre los registros ya procesados: no tocan la base,
// asi cada regla se prueba con casos de referencia. Para un feriado o una fuente nueva con la
// misma estructura no hay que cambiar nada; para una estructura distinta se agregan indicadores.

export type RegistroDatos = Record<string, unknown>;

export type EstructuraIndicador = 'ots_turista_v1' | 'ots_hotel_v1';

export interface ItemDistribucion {
    categoria: string;
    n: number;
    porcentaje: number; // sobre los registros usados, con 1 decimal
}

export interface ResultadoIndicador {
    id: string;
    valor: number | null; // null si no hay datos suficientes
    unidad: string;
    distribucion?: ItemDistribucion[];
    registrosUsados: number;
    registrosExcluidos: number; // sin dato o con dato incoherente: no entran al calculo
}

export interface Indicador {
    id: string;
    nombre: string;
    descripcion: string;
    estructura: EstructuraIndicador;
    // Aclaracion obligatoria cuando el significado del dato todavia no esta confirmado con la fuente
    advertencia?: string;
    calcular: (registros: RegistroDatos[]) => Omit<ResultadoIndicador, 'id'>;
}

// --- utilidades ---------------------------------------------------------------------

const redondear = (n: number, decimales: number): number => {
    const f = 10 ** decimales;
    return Math.round((n + Number.EPSILON) * f) / f;
};

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const texto = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
};

function distribuir(categorias: string[]): ItemDistribucion[] {
    const conteo = new Map<string, number>();
    for (const c of categorias) conteo.set(c, (conteo.get(c) ?? 0) + 1);
    const total = categorias.length;
    return [...conteo.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
        .map(([categoria, n]) => ({ categoria, n, porcentaje: redondear((n / total) * 100, 1) }));
}

// --- fabricas de indicadores sencillos -------------------------------------------------

function conteo(): Indicador['calcular'] {
    return (registros) => ({ valor: registros.length, unidad: 'registros', registrosUsados: registros.length, registrosExcluidos: 0 });
}

function promedio(columna: string, unidad: string, decimales = 2): Indicador['calcular'] {
    return (registros) => {
        const valores = registros.map((r) => numero(r[columna])).filter((v): v is number => v !== null);
        const suma = valores.reduce((a, b) => a + b, 0);
        return {
            valor: valores.length ? redondear(suma / valores.length, decimales) : null,
            unidad,
            registrosUsados: valores.length,
            registrosExcluidos: registros.length - valores.length,
        };
    };
}

function distribucion(columna: string): Indicador['calcular'] {
    return (registros) => {
        const categorias = registros.map((r) => texto(r[columna])).filter((v): v is string => v !== null);
        return { valor: null, unidad: '%', distribucion: distribuir(categorias), registrosUsados: categorias.length, registrosExcluidos: registros.length - categorias.length };
    };
}

// --- indicadores de turistas ------------------------------------------------------------

const T = 'ots_turista_v1' as const;
const H = 'ots_hotel_v1' as const;

export const CATALOGO: Indicador[] = [
    { id: 'T1', nombre: 'Encuestas procesadas', descripcion: 'Cantidad de encuestas a turistas que pasaron el procesamiento.', estructura: T, calcular: conteo() },
    { id: 'T2', nombre: 'Distribución por género', descripcion: 'Porcentaje de encuestados por cada categoría de género de la fuente.', estructura: T, calcular: distribucion('genero') },
    { id: 'T3', nombre: 'Edad promedio', descripcion: 'Promedio de la edad de los encuestados. Se excluyen los que no respondieron.', estructura: T, calcular: promedio('edad', 'años', 1) },
    {
        id: 'T4', nombre: 'Procedencia', descripcion: 'Porcentaje de encuestados que residen en Ecuador y distribución por país de residencia.', estructura: T,
        calcular: (registros) => {
            const paises = registros.map((r) => texto(r['pais_residencia'])).filter((v): v is string => v !== null && v !== 'Prefiero no responder');
            const ecuador = paises.filter((p) => p === 'Ecuador').length;
            return {
                valor: paises.length ? redondear((ecuador / paises.length) * 100, 1) : null,
                unidad: '% residentes en Ecuador',
                distribucion: distribuir(paises),
                registrosUsados: paises.length,
                registrosExcluidos: registros.length - paises.length,
            };
        },
    },
    { id: 'T5', nombre: 'Motivo de visita', descripcion: 'Porcentaje de encuestados por motivo principal de visita.', estructura: T, calcular: distribucion('motivo_visita') },
    { id: 'T6', nombre: 'Compañía de viaje', descripcion: 'Porcentaje de encuestados según con quién viajan.', estructura: T, calcular: distribucion('con_quien_viaja') },
    { id: 'T7', nombre: 'Transporte de llegada', descripcion: 'Porcentaje de encuestados por medio de transporte con el que llegaron.', estructura: T, calcular: distribucion('transporte_llegada') },
    {
        id: 'T8', nombre: 'Estadía promedio', descripcion: 'Promedio de noches de estadía reportadas.', estructura: T, calcular: promedio('noches_estadia', 'noches'),
        advertencia: 'Aún no se confirma con el Observatorio qué significa 0 noches; el 0 se incluye como valor reportado.',
    },
    {
        id: 'T9', nombre: 'Gasto total reportado promedio', descripcion: 'Promedio del gasto total declarado en cada encuesta.', estructura: T, calcular: promedio('gasto_total', 'USD'),
        advertencia: 'Aún no se confirma si el gasto es por persona o por grupo: se muestra como lo reporta cada encuesta.',
    },
    { id: 'T10', nombre: 'Satisfacción general promedio', descripcion: 'Promedio de la satisfacción general en escala de 1 a 5.', estructura: T, calcular: promedio('nivel_satisfaccion', 'de 5') },
    { id: 'T11', nombre: 'Satisfacción con la seguridad', descripcion: 'Promedio de la satisfacción con la seguridad en escala de 1 a 5.', estructura: T, calcular: promedio('satisfaccion_seguridad', 'de 5') },
    { id: 'T12', nombre: 'Probabilidad de retorno promedio', descripcion: 'Promedio de la probabilidad de volver, en escala de 1 a 5, tal como la reporta la fuente.', estructura: T, calcular: promedio('probabilidad_retorno', 'de 5') },

    // --- hoteles --------------------------------------------------------------------------
    {
        id: 'H1', nombre: 'Establecimientos reportados', descripcion: 'Cantidad de hoteles distintos que reportaron datos.', estructura: H,
        calcular: (registros) => {
            const ids = new Set(registros.map((r) => texto(String(r['id_hotel'] ?? ''))).filter((v): v is string => v !== null));
            return { valor: ids.size, unidad: 'establecimientos', registrosUsados: registros.length, registrosExcluidos: 0 };
        },
    },
    {
        id: 'H2', nombre: 'Ocupación hotelera', descripcion: 'Habitaciones ocupadas entre habitaciones disponibles, sumadas sobre todos los registros. No es el promedio de porcentajes.', estructura: H,
        calcular: (registros) => {
            let ocupadas = 0, disponibles = 0, usados = 0;
            for (const r of registros) {
                const o = numero(r['habitaciones_ocupadas']), d = numero(r['habitaciones_disponibles']);
                if (o === null || d === null || d <= 0 || o > d) continue; // dato incoherente: no entra
                ocupadas += o; disponibles += d; usados++;
            }
            return { valor: disponibles > 0 ? redondear((ocupadas / disponibles) * 100, 2) : null, unidad: '%', registrosUsados: usados, registrosExcluidos: registros.length - usados };
        },
    },
    {
        id: 'H3', nombre: 'Turistas alojados', descripcion: 'Total de turistas registrados en los hoteles, y su división entre nacionales y extranjeros.', estructura: H,
        calcular: (registros) => {
            let total = 0, nac = 0, ext = 0, usados = 0;
            for (const r of registros) {
                const t = numero(r['total_turistas']), n = numero(r['checkin_nacionales']), e = numero(r['checkin_extranjeros']);
                if (t === null || n === null || e === null || n + e !== t) continue; // no suma: no entra
                total += t; nac += n; ext += e; usados++;
            }
            return {
                valor: total, unidad: 'turistas', registrosUsados: usados, registrosExcluidos: registros.length - usados,
                distribucion: total > 0 ? [
                    { categoria: 'Nacionales', n: nac, porcentaje: redondear((nac / total) * 100, 1) },
                    { categoria: 'Extranjeros', n: ext, porcentaje: redondear((ext / total) * 100, 1) },
                ] : [],
            };
        },
    },
    // H4 (tarifa promedio) no se incluye: tarifa_cobrada mezcla valores por habitacion y totales
    // (hay tarifas de 1890 con 16 habitaciones ocupadas) y 85 de 277 registros traen 0.
    // Se agrega cuando el Observatorio confirme que significa ese campo.
];

export function indicadoresDe(estructura: string): Indicador[] {
    return CATALOGO.filter((i) => i.estructura === estructura);
}

export function calcularIndicadores(estructura: string, registros: RegistroDatos[]): Array<ResultadoIndicador & { nombre: string; descripcion: string; advertencia?: string }> {
    return indicadoresDe(estructura).map((i) => ({
        id: i.id,
        nombre: i.nombre,
        descripcion: i.descripcion,
        ...(i.advertencia ? { advertencia: i.advertencia } : {}),
        ...i.calcular(registros),
    }));
}
