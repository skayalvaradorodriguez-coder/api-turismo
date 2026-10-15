// Cantones y parroquias de la provincia de Santa Elena segun la division oficial (INEC).
// Lista verificada por la autora del proyecto. Si cambia la division oficial, se edita aqui y en su prueba.
export const PROVINCIA = 'SANTA ELENA';

export const CATALOGO_PARROQUIAS: Readonly<Record<string, readonly string[]>> = {
    'LA LIBERTAD': ['LA LIBERTAD'],
    SALINAS: [
        'ANCONCITO',
        'CARLOS ESPINOZA LARREA',
        'GENERAL ALBERTO ENRÍQUEZ GALLO',
        'JOSÉ LUIS TAMAYO',
        'SALINAS',
        'SANTA ROSA',
        'VICENTE ROCAFUERTE',
    ],
    'SANTA ELENA': [
        'ATAHUALPA',
        'BALLENITA',
        'CHANDUY',
        'COLONCHE',
        'MANGLARALTO',
        'SAN JOSÉ DE ANCÓN',
        'SANTA ELENA',
        'SIMÓN BOLÍVAR',
    ],
};

// Errores de escritura conocidos en los datos reales. Solo se corrige lo que esta aqui: nunca se adivina.
// Clave: texto ya reducido con claveComparable(). Valor: nombre oficial.
const CORRECCIONES_PARROQUIA: Readonly<Record<string, string>> = {
    MANGLARLTO: 'MANGLARALTO',
    'GRAL ENRIQUEZ GALLO': 'GENERAL ALBERTO ENRÍQUEZ GALLO',
};

/** Quita espacios de los extremos y deja un solo espacio entre palabras. */
export function limpiarEspacios(texto: string): string {
    return texto.replace(/\s+/g, ' ').trim();
}

/** Forma para comparar: sin tildes, mayusculas, sin signos y con espacios simples. */
export function claveComparable(texto: string): string {
    return limpiarEspacios(
        texto
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, ' '),
    );
}

export type EstadoResolucion = 'oficial' | 'normalizada' | 'corregida' | 'desconocida';

export interface ResultadoCanton {
    estado: EstadoResolucion;
    valor: string | null; // nombre oficial; null si es desconocido
}

export function resolverCanton(original: string): ResultadoCanton {
    const clave = claveComparable(original);
    const oficial = Object.keys(CATALOGO_PARROQUIAS).find((c) => claveComparable(c) === clave);
    if (oficial === undefined) return { estado: 'desconocida', valor: null };
    return { estado: original === oficial ? 'oficial' : 'normalizada', valor: oficial };
}

/**
 * Busca la parroquia dentro de su canton.
 * oficial: igual al catalogo. normalizada: solo difiere en espacios, tildes o mayusculas.
 * corregida: error de escritura conocido. desconocida: no esta en ese canton (no se adivina).
 */
export function resolverParroquia(canton: string, original: string): ResultadoCanton {
    const cantonOficial = resolverCanton(canton).valor;
    if (cantonOficial === null) return { estado: 'desconocida', valor: null };
    const lista = CATALOGO_PARROQUIAS[cantonOficial] ?? [];
    const clave = claveComparable(original);

    const oficial = lista.find((p) => claveComparable(p) === clave);
    if (oficial !== undefined) return { estado: original === oficial ? 'oficial' : 'normalizada', valor: oficial };

    const corregida = CORRECCIONES_PARROQUIA[clave];
    if (corregida !== undefined && lista.includes(corregida)) return { estado: 'corregida', valor: corregida };

    return { estado: 'desconocida', valor: null };
}
