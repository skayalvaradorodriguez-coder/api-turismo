// Catalogo de indicadores. Cada indicador es una definicion (que es, de que estructura sale y
// como se calcula). Son funciones puras sobre los registros ya procesados: no tocan la base,
// asi cada regla se prueba con casos de referencia. Para un feriado o una fuente nueva con la
// misma estructura no hay que cambiar nada; para una estructura distinta se agregan indicadores.

export type RegistroDatos = Record<string, unknown>;

export type EstructuraIndicador = 'ots_turista_v1' | 'ots_hotel_v1' | 'kobo_carnaval_v1' | 'kobo_semana_santa_v1';

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
    // true si cada encuestado pudo elegir varias opciones: los porcentajes no suman 100 y no se dibujan como reparto
    respuestaMultiple?: boolean;
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

const CATALOGO_OTS: Indicador[] = [
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

// --- Carnaval 2026 (estructura kobo_carnaval_v1) ---------------------------------------------
// Un indicador por cada variable de la encuesta que se puede resumir; las definiciones salen del
// diccionario que entrega el Observatorio. No se convierte ningun rango de gasto a numero: se
// muestra el reparto por rango tal como se respondio. Las columnas que son identificadores,
// fechas, GPS, textos libres o copias 0/1 de otra columna (sexo_*, edu_*) se conservan en los
// registros pero no generan indicador propio.

const K = 'kobo_carnaval_v1' as const;

const marcado = (v: unknown): boolean => v === 1 || v === '1';
const esMarca = (v: unknown): boolean => v === 0 || v === 1 || v === '0' || v === '1';

/** Pregunta de seleccion multiple guardada como columnas 0/1: % de encuestados que marcaron cada opcion. */
function seleccionMultiple(opciones: Array<[etiqueta: string, columna: string]>): Indicador['calcular'] {
    return (registros) => {
        const validos = registros.filter((r) => opciones.some(([, c]) => esMarca(r[c])));
        const items: ItemDistribucion[] = opciones
            .map(([categoria, columna]) => {
                const n = validos.filter((r) => marcado(r[columna])).length;
                return { categoria, n, porcentaje: validos.length ? redondear((n / validos.length) * 100, 1) : 0 };
            })
            .sort((a, b) => b.n - a.n || a.categoria.localeCompare(b.categoria, 'es'));
        return { valor: null, unidad: '%', distribucion: items, respuestaMultiple: true, registrosUsados: validos.length, registrosExcluidos: registros.length - validos.length };
    };
}

const AVISO_MULTIPLE = ' Cada encuestado pudo marcar varias opciones, por eso los porcentajes no suman 100.';
const AVISO_GASTO = 'Es un rango en dólares declarado por persona y día. No se convierte a un número: el Observatorio aún no define cómo hacerlo.';

type EspecificacionCarnaval = [nombre: string, descripcion: string, calcular: Indicador['calcular'], advertencia?: string];

const ESPECIFICACIONES_CARNAVAL: EspecificacionCarnaval[] = [
    ['Encuestas procesadas', 'Cantidad de encuestas del feriado que pasaron el procesamiento.', conteo()],
    // Perfil
    ['Distribución por género', 'Porcentaje de encuestados por género.', distribucion('sexo')],
    ['Distribución por edad', 'Porcentaje de encuestados por rango de edad.', distribucion('edad')],
    ['Procedencia', 'Porcentaje de encuestados por país de origen.', distribucion('pais_origen')],
    ['Nivel educativo', 'Porcentaje de encuestados por nivel educativo.', distribucion('educacion')],
    ['Ocupación', 'Porcentaje de encuestados por ocupación.', distribucion('ocupacion')],
    // Viaje
    ['Tamaño del grupo de viaje', 'Porcentaje de encuestados según el número de personas del grupo.', distribucion('tamanio_grupo')],
    ['Motivo del viaje', 'Porcentaje de encuestados por motivo principal del viaje.', distribucion('motivo_viaje')],
    ['Frecuencia de visita', 'Porcentaje de encuestados según con qué frecuencia visitan el destino.', distribucion('frecuencia_visita')],
    ['Compañía de viaje', 'Porcentaje de encuestados según con quién viajan.', distribucion('companero_viaje')],
    ['Atracciones de interés', 'Porcentaje de encuestados interesados en cada tipo de atracción.' + AVISO_MULTIPLE, seleccionMultiple([
        ['Ciudad', 'atr_ciudad'], ['Cultura y patrimonio', 'atr_cultura'], ['Naturaleza y aventura', 'atr_naturaleza'],
        ['Turismo rural', 'atr_rural'], ['Sol y playa', 'atr_sol_playa'], ['Gastronomía', 'atr_gastronomia'],
        ['Entretenimiento y vida nocturna', 'atr_entretenimiento'], ['Ferias y convenciones', 'atr_ferias'], ['Turismo deportivo', 'atr_deportivo'],
    ])],
    ['Destino específico visitado', 'Porcentaje de encuestados por destino o lugar que declararon visitar (texto libre de la encuesta).', distribucion('destino_especifico')],
    ['Noches de estadía', 'Porcentaje de encuestados según el número de noches de estadía.', distribucion('noches_estadia')],
    // Planificación
    ['Fuentes de información', 'Porcentaje de encuestados que usó cada fuente para informarse del destino.' + AVISO_MULTIPLE, seleccionMultiple([
        ['Buscadores de internet', 'info_internet'], ['Agencias en línea', 'info_agencias_online'], ['Agentes de viaje', 'info_agentes_viaje'],
        ['Recomendaciones personales', 'info_recomendaciones'], ['Opiniones en línea', 'info_opiniones_online'],
        ['Sitio web del destino', 'info_sitio_web_destino'], ['Redes sociales', 'info_redes_sociales'], ['Otro medio', 'info_otro_medio'],
    ])],
    ['Facilidad para encontrar información', 'Porcentaje de encuestados según lo fácil que fue encontrar información del destino.', distribucion('facilidad_info')],
    ['Método de planificación', 'Porcentaje de encuestados según cómo planificaron el viaje.', distribucion('metodo_planificacion')],
    ['Anticipación de la reserva', 'Porcentaje de encuestados según con cuánta anticipación reservaron o planificaron.', distribucion('anticipacion_reserva')],
    // Transporte
    ['Transporte de llegada', 'Porcentaje de encuestados por medio de transporte con el que llegaron al destino.', distribucion('transporte_llegada')],
    ['Transporte local', 'Porcentaje de encuestados que usó cada medio de transporte dentro del destino.' + AVISO_MULTIPLE, seleccionMultiple([
        ['Transporte público (bus)', 'trans_bus'], ['Taxi amarillo', 'trans_taxi'], ['Vehículo motorizado alquilado', 'trans_moto_alquilado'],
        ['Vehículo de familiar o amigo', 'trans_moto_familiar'], ['Uber u otras aplicaciones', 'trans_uber'], ['Bicicleta', 'trans_bicicleta'],
    ])],
    // Gasto (rangos)
    ['Presupuesto total por persona y día', 'Porcentaje de encuestados por rango de presupuesto total.', distribucion('presupuesto_total_dia'), AVISO_GASTO],
    ['Gasto en alojamiento', 'Porcentaje de encuestados por rango de gasto en alojamiento.', distribucion('gasto_alojamiento'), AVISO_GASTO],
    ['Gasto en alimentación', 'Porcentaje de encuestados por rango de gasto en alimentación.', distribucion('gasto_alimentacion'), AVISO_GASTO],
    ['Gasto en actividades', 'Porcentaje de encuestados por rango de gasto en actividades.', distribucion('gasto_actividades'), AVISO_GASTO],
    ['Gasto en compras', 'Porcentaje de encuestados por rango de gasto en compras.', distribucion('gasto_compras'), AVISO_GASTO],
    ['Gasto en otros conceptos', 'Porcentaje de encuestados por rango de gasto en otros conceptos.', distribucion('gasto_otros'), AVISO_GASTO],
    ['Categoría de gasto prioritaria', 'Porcentaje de encuestados según la categoría en la que darían prioridad a gastar.', distribucion('categoria_gasto_prioritario')],
    ['Perfil de viajero', 'Porcentaje de encuestados por perfil de viajero según su patrón de gasto.', distribucion('perfil_viajero')],
    // Experiencia
    ['Expectativas cumplidas', 'Porcentaje de encuestados según en qué medida el destino cumplió sus expectativas.', distribucion('expectativas_cumplidas')],
    ['Calificación de la información turística', 'Promedio de la calificación de 1 a 5 de la información turística disponible.', promedio('cal_info_turistica', 'de 5')],
    ['Calificación de la atención local', 'Promedio de la calificación de 1 a 5 de la atención y amabilidad de la población.', promedio('cal_atencion_local', 'de 5')],
    ['Calificación de la seguridad', 'Promedio de la calificación de 1 a 5 de la seguridad percibida.', promedio('cal_seguridad', 'de 5')],
    ['Calificación de la limpieza', 'Promedio de la calificación de 1 a 5 de la limpieza y mantenimiento del entorno.', promedio('cal_limpieza', 'de 5')],
    ['Calificación de la relación calidad-precio', 'Promedio de la calificación de 1 a 5 de la relación calidad-precio de los servicios.', promedio('cal_relacion_precio', 'de 5')],
    ['Satisfacción con los atractivos', 'Promedio de la satisfacción general de 1 a 5 con los atractivos turísticos.', promedio('satisfaccion_atractivos', 'de 5')],
    ['Probabilidad de recomendar', 'Promedio de la probabilidad de recomendar el destino, en escala de 1 a 5, tal como la define el diccionario del Observatorio.', promedio('nps_recomendar', 'de 5')],
    ['Probabilidad de volver', 'Promedio de la probabilidad de volver al destino, en escala de 1 a 5, tal como la define el diccionario del Observatorio.', promedio('nps_volver', 'de 5')],
    ['Razón de satisfacción o insatisfacción', 'Porcentaje de encuestados por la razón principal que dieron.', distribucion('razon_satisfaccion'),
        'Las opciones registradas describen sobre todo motivos de insatisfacción; se muestran tal como las respondieron.'],
];

const CATALOGO_CARNAVAL: Indicador[] = ESPECIFICACIONES_CARNAVAL.map(([nombre, descripcion, calcular, advertencia], i) => ({
    id: `C${i + 1}`,
    nombre,
    descripcion,
    estructura: K,
    ...(advertencia ? { advertencia } : {}),
    calcular,
}));

// --- Semana Santa 2026 (estructura kobo_semana_santa_v1) --------------------------------------
// Version depurada por el Observatorio. Sus encabezados de pregunta son genericos ("Pregunta.4"):
// cada columna se identifico por su posicion en el cuestionario y por sus respuestas, y se
// verifico contra el reporte del Observatorio (la probabilidad de recomendar coincide exacto).
// Las preguntas de varias respuestas vienen como un texto con las opciones pegadas: se cuenta
// cuantos encuestados mencionan cada opcion.

const S = 'kobo_semana_santa_v1' as const;
const SA = 'SECCIÓN A. PERFIL SOCIODEMOGRÁFICO/';
const SB = 'SECCIÓN B. PLANEACIÓN DEL VIAJE/';
const SC = 'SECCIÓN C. ESTRUCTURA DE CONSUMO/';

/** Quita saltos de linea y espacios repetidos de un encabezado (algunos traen saltos de linea en medio). */
const claveNormal = (k: string): string => k.replace(/\s+/g, ' ').trim();

const sinRespuesta = (v: string): boolean => v.toLowerCase() === 'prefiero no responder';

/** Pregunta de varias respuestas guardada como texto: % de encuestados cuyo texto menciona cada opcion. */
function seleccionMultipleTexto(columna: string, opciones: Array<[etiqueta: string, ...fragmentos: string[]]>): Indicador['calcular'] {
    return (registros) => {
        const textos = registros.map((r) => texto(r[columna])).filter((v): v is string => v !== null && !sinRespuesta(v));
        const items: ItemDistribucion[] = opciones
            .map(([categoria, ...fragmentos]) => {
                const n = textos.filter((t) => fragmentos.some((f) => t.toLowerCase().includes(f.toLowerCase()))).length;
                return { categoria, n, porcentaje: textos.length ? redondear((n / textos.length) * 100, 1) : 0 };
            })
            .sort((a, b) => b.n - a.n || a.categoria.localeCompare(b.categoria, 'es'));
        return { valor: null, unidad: '%', distribucion: items, respuestaMultiple: true, registrosUsados: textos.length, registrosExcluidos: registros.length - textos.length };
    };
}

const AVISO_PREGUNTA_SIN_NOMBRE = 'El encabezado de esta pregunta en el archivo es genérico; se identificó por su posición y sus respuestas.';

const ESPECIFICACIONES_SEMANA_SANTA: EspecificacionCarnaval[] = [
    ['Encuestas procesadas', 'Cantidad de encuestas del feriado que pasaron el procesamiento.', conteo()],
    ['Distribución por género', 'Porcentaje de encuestados por género.', distribucion(`${SA}2. ¿Con qué género se identifica usted?`)],
    ['Distribución por edad', 'Porcentaje de encuestados por rango de edad.', distribucion(`${SA}Pregunta`)],
    ['Procedencia', 'Porcentaje de encuestados por país de residencia.', distribucion(`${SA}Pregunta.1`)],
    ['Nivel educativo', 'Porcentaje de encuestados por nivel educativo.', distribucion(`${SA}Pregunta.2`)],
    ['Ocupación', 'Porcentaje de encuestados por ocupación.', distribucion(`${SA}Pregunta.3`)],
    ['Tamaño del grupo de viaje', 'Porcentaje de encuestados según el número de personas del grupo.', distribucion(`${SA}Pregunta.4`)],
    ['Motivo del viaje', 'Porcentaje de encuestados por motivo principal del viaje.', distribucion(`${SA}Pregunta.5`)],
    ['Frecuencia de visita', 'Porcentaje de encuestados según con qué frecuencia visitan el destino.', distribucion(`${SB}Pregunta`)],
    ['Compañía de viaje', 'Porcentaje de encuestados según con quién viajan.', distribucion(`${SB}Pregunta.1`)],
    ['Atracciones de interés', 'Porcentaje de encuestados interesados en cada tipo de atracción.' + AVISO_MULTIPLE, seleccionMultipleTexto(`${SB}Pregunta.2`, [
        ['Sol y playa', 'Sol y playa'], ['Gastronomía', 'Gastronomía'], ['Ciudad', 'Ciudad ('], ['Naturaleza y aventura', 'Naturaleza y Aventura'],
        ['Cultura y patrimonio', 'Cultura y Patrimonio'], ['Entretenimiento y vida nocturna', 'Entretenimiento y vida nocturna'],
        ['Turismo rural', 'Turismo rural'], ['Ferias y convenciones', 'ferias y convenciones'], ['Turismo deportivo', 'Turismo deportivo'],
    ])],
    ['Destinos de alta afluencia visitados', 'Porcentaje de quienes visitaron al menos un destino de este grupo (cuartil 1) y mencionaron cada uno.' + AVISO_MULTIPLE, seleccionMultipleTexto('Q1_Destinos_Alta_Afluencia', [
        ['La Chocolatera', 'La Chocolatera'], ['La Lobería', 'La Lobería'], ['Cerro El Morro', 'Cerro El Morro'], ['Chipipe', 'Chipipe'], ['San Lorenzo', 'San Lorenzo'], ['Playa Ballenita', 'Ballenita'],
    ])],
    ['Destinos de afluencia moderada visitados', 'Porcentaje de quienes visitaron al menos un destino de este grupo (cuartil 2) y mencionaron cada uno.' + AVISO_MULTIPLE, seleccionMultipleTexto('Q2_Destinos_Afluencia_Moderada', [
        ['Dos Mangas', 'Dos Mangas'], ['Playa Chulluipe', 'Chulluipe'], ['Puerto Lucía', 'Puerto Lu'], ['Playa Cautivo', 'Cautivo'], ['Playa La Libertad', 'Playa La Liber'], ['Aguas Termales', 'Aguas Termales'],
    ])],
    ['Destinos de baja afluencia visitados', 'Porcentaje de quienes visitaron al menos un destino de este grupo (cuartil 3) y mencionaron cada uno.' + AVISO_MULTIPLE, seleccionMultipleTexto('Q3_Destinos_Baja_Afluencia', [
        ['Palmar', 'Palmar'], ['Loma Alta', 'Loma Alta'], ['Simón Bolívar', 'Simón Bolívar'], ['Cadeate', 'Cadeate'],
    ])],
    ['Destinos de visitación marginal visitados', 'Porcentaje de quienes visitaron al menos un destino de este grupo (cuartil 4) y mencionaron cada uno.' + AVISO_MULTIPLE, seleccionMultipleTexto('Q4_Destinos_Visitacion_Marginal', [
        ['Curia', 'Curia'], ['San José', 'San José'], ['Las Núñez', 'Las Nu'], ['La Entrada', 'La Entrada'], ['La Rinconada', 'La Rinconada'],
    ])],
    ['Noches de estadía', 'Porcentaje de encuestados según el número de noches de estadía.', distribucion(`${SB}Pregunta.3`)],
    ['Fuentes de información', 'Porcentaje de encuestados por la fuente principal con la que se informaron del destino.', distribucion(`${SB}Pregunta.4`)],
    ['Facilidad para encontrar información', 'Porcentaje de encuestados según lo fácil que fue encontrar información del destino.', distribucion(`${SB}Pregunta.5`)],
    ['Método de planificación', 'Porcentaje de encuestados según cómo planificaron el viaje.', distribucion(`${SB}Pregunta.6`)],
    ['Anticipación de la reserva', 'Porcentaje de encuestados según con cuánta anticipación reservaron o planificaron.', distribucion(`${SB}Pregunta.7`)],
    ['Transporte de llegada', 'Porcentaje de encuestados por medio de transporte con el que llegaron al destino.', distribucion(`${SB}Pregunta.8`)],
    ['Transporte local', 'Porcentaje de encuestados que usó cada medio de transporte dentro del destino.' + AVISO_MULTIPLE, seleccionMultipleTexto(`${SC}Pregunta`, [
        ['Vehículo propio', 'Vehículo propio'], ['Taxi amarillo', 'Taxi amarillo'], ['Transporte público (bus)', 'Transporte público (bus)'],
        ['Uber u otras aplicaciones', 'Uber u otras', 'Servicio de transporte por app'], ['Vehículo motorizado alquilado', 'Vehículo motorizado alquilado'],
        ['Autobús interprovincial', 'Autobús interprovincial'], ['Bicicleta', 'Bicicleta'], ['Vehículo de familiar o amigo', 'Vehículo de un familiar', 'Vehículo motorizado familiar'],
    ])],
    ['Presupuesto total por persona y día', 'Porcentaje de encuestados por rango de presupuesto total.', distribucion(`${SC}19. En promedio, ¿cuál es su presupuesto total por persona para el gasto asociado con su viaje por día?`), AVISO_GASTO],
    ['Gasto en alojamiento', 'Porcentaje de encuestados por rango de gasto en alojamiento.', distribucion(`${SC}Gasto_Alojamiento`), AVISO_GASTO],
    ['Gasto en alimentación', 'Porcentaje de encuestados por rango de gasto en alimentación.', distribucion(`${SC}Gasto_Alimentacion`), AVISO_GASTO],
    ['Gasto en transporte', 'Porcentaje de encuestados por rango de gasto en transporte.', distribucion(`${SC}Gasto_Transporte`), AVISO_GASTO],
    ['Gasto en actividades', 'Porcentaje de encuestados por rango de gasto en actividades.', distribucion(`${SC}Gasto_Actividades`), AVISO_GASTO],
    ['Gasto en compras y recuerdos', 'Porcentaje de encuestados por rango de gasto en compras y souvenirs.', distribucion(`${SC}Gasto_Compras_Souvenirs`), AVISO_GASTO],
    ['Categoría de gasto prioritaria', 'Porcentaje de encuestados según la categoría en la que darían prioridad a gastar.', distribucion(`${SC}Pregunta.1`)],
    ['Perfil de viajero', 'Porcentaje de encuestados por perfil de viajero según su patrón de gasto.', distribucion(`${SC}Pregunta.2`)],
    ['Expectativas cumplidas', 'Porcentaje de encuestados según en qué medida el destino cumplió sus expectativas.', distribucion(`${SC}Pregunta.3`)],
    ['Calificación de la información turística', 'Promedio de la calificación de 1 a 5 de la información turística disponible.', promedio(`${SC}Pregunta_019/Información turística disponible (oficinas, mapas, señalización, apps)`, 'de 5')],
    ['Calificación de la atención local', 'Promedio de la calificación de 1 a 5 de la atención y amabilidad de la población.', promedio(`${SC}Pregunta_019/Atención y amabilidad de la población local`, 'de 5')],
    ['Calificación de la seguridad', 'Promedio de la calificación de 1 a 5 de la seguridad percibida.', promedio(`${SC}Pregunta_019/Seguridad percibida durante su estancia`, 'de 5')],
    ['Calificación de la limpieza', 'Promedio de la calificación de 1 a 5 de la limpieza y mantenimiento del entorno.', promedio(`${SC}Pregunta_019/Limpieza y mantenimiento del entorno`, 'de 5')],
    ['Calificación de la relación calidad-precio', 'Promedio de la calificación de 1 a 5 de la relación calidad-precio de los servicios.', promedio(`${SC}Pregunta_019/Relación calidad-precio de los servicios recibidos`, 'de 5')],
    ['Satisfacción con los atractivos', 'Promedio de la satisfacción general de 1 a 5 con los atractivos turísticos.', promedio(`${SC}Pregunta_020/¿Cuál es su nivel de satisfaccion con respecto a su experiencia en los atractivos turisticos de Santa Elena que ha visitado?`, 'de 5')],
    ['Probabilidad de volver', 'Porcentaje de encuestados por su probabilidad de volver a visitar el destino (escala de 1 a 5).', distribucion(`${SC}Pregunta.4`),
        AVISO_PREGUNTA_SIN_NOMBRE + ' Sus porcentajes no coinciden con los del reporte del Observatorio sobre «volver a visitar»; falta que el Observatorio confirme qué pregunta es.'],
    ['Razón principal indicada', 'Porcentaje de encuestados por la razón principal que indicaron.', distribucion(`${SC}Pregunta.5`), AVISO_PREGUNTA_SIN_NOMBRE],
    ['Probabilidad de recomendar', 'Porcentaje de encuestados por su probabilidad de recomendar el destino a un amigo o colega (escala de 1 a 5).', distribucion(`${SC}Pregunta.6`)],
];

const CATALOGO_SEMANA_SANTA: Indicador[] = ESPECIFICACIONES_SEMANA_SANTA.map(([nombre, descripcion, calcular, advertencia], i) => ({
    id: `S${i + 1}`,
    nombre,
    descripcion,
    estructura: S,
    ...(advertencia ? { advertencia } : {}),
    calcular,
}));

// Estructuras cuyos encabezados traen saltos de linea o espacios repetidos
const NORMALIZAR_CLAVES = new Set<string>([S]);

export const CATALOGO: Indicador[] = [...CATALOGO_OTS, ...CATALOGO_CARNAVAL, ...CATALOGO_SEMANA_SANTA];

export function indicadoresDe(estructura: string): Indicador[] {
    return CATALOGO.filter((i) => i.estructura === estructura);
}

export function calcularIndicadores(estructura: string, registrosOriginales: RegistroDatos[]): Array<ResultadoIndicador & { nombre: string; descripcion: string; advertencia?: string }> {
    const registros = NORMALIZAR_CLAVES.has(estructura)
        ? registrosOriginales.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [claveNormal(k), v])))
        : registrosOriginales;
    return indicadoresDe(estructura).map((i) => ({
        id: i.id,
        nombre: i.nombre,
        descripcion: i.descripcion,
        ...(i.advertencia ? { advertencia: i.advertencia } : {}),
        ...i.calcular(registros),
    }));
}
