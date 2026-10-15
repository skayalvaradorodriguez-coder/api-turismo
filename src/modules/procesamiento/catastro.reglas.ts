import { PROVINCIA, claveComparable, limpiarEspacios, resolverCanton, resolverParroquia } from './catastro.catalogo';
import { leerCsv } from './catastro.csv';

export type Severidad = 'error' | 'alerta';
export type SimboloCategoria = 'estrellas' | 'tenedores' | 'copas' | 'tazas' | 'unica';

export interface Hallazgo {
    fila: number | null; // numero de fila de datos (la primera despues del encabezado es la 1); null si es del archivo completo
    columna: string | null;
    regla: string;
    severidad: Severidad;
    mensaje: string;
    valorOriginal: string | null;
    valorCorregido: string | null;
}

export interface RegistroCatastro {
    filaOrigen: number;
    numeroRegistro: string;
    ruc: string;
    nombreComercial: string | null;
    actividad: string;
    clasificacion: string;
    categoria: string;
    categoriaOriginal: string;
    categoriaSimbolo: SimboloCategoria | null;
    categoriaNivel: number | null;
    propietario: string | null;
    provincia: string;
    canton: string;
    parroquia: string;
    parroquiaOriginal: string;
    estadoRegistro: string;
}

export interface ResultadoCatastro {
    totalFilas: number;
    registros: RegistroCatastro[]; // solo las filas sin errores
    hallazgos: Hallazgo[];
    totalErrores: number;
    totalAlertas: number;
}

// Nombres de columna esperados, escritos en la forma de claveComparable()
const COLUMNAS = {
    ruc: 'RUC',
    nombre: 'NOMBRE COMERCIAL',
    registro: 'NUMERO DE REGISTRO',
    actividad: 'ACTIVIDAD MODALIDAD',
    clasificacion: 'CLASIFICACION',
    categoria: 'CATEGORIA',
    propietario: 'RAZON SOCIAL PROPIETARIO',
    provincia: 'PROVINCIA',
    canton: 'CANTON',
    parroquia: 'PARROQUIA',
    estado: 'ESTADO REGISTRO DEL ESTABLECIMIENTO',
} as const;
type Columna = keyof typeof COLUMNAS;

// Largo maximo de cada campo, igual que en la tabla catastro_establecimientos
const LARGO_MAXIMO: Partial<Record<Columna, number>> = {
    nombre: 120,
    registro: 40,
    actividad: 80,
    clasificacion: 80,
    categoria: 40,
    propietario: 120,
    canton: 40,
    parroquia: 60,
    estado: 40,
};

const COLUMNAS_SENSIBLES: readonly Columna[] = ['ruc', 'propietario'];
const FORMATO_REGISTRO = /^\d{13}\.\d{3}\.\d+$/;
const MAX_VALOR_HALLAZGO = 300;

const recortar = (valor: string): string => (valor.length > MAX_VALOR_HALLAZGO ? valor.slice(0, MAX_VALOR_HALLAZGO) : valor);

interface CategoriaInterpretada {
    categoria: string;
    simbolo: SimboloCategoria | null;
    nivel: number | null;
    regla: 'categoria_normalizada' | 'categoria_uno' | 'categoria_desconocida' | null;
}

/** Convierte el texto de la categoria en valor normalizado, simbolo (estrellas, tenedores...) y nivel (1 a 5). */
export function interpretarCategoria(limpio: string): CategoriaInterpretada {
    const clave = claveComparable(limpio);
    if (clave === 'CATEGORIA UNICA') {
        const canonica = 'Categoría Única';
        return { categoria: canonica, simbolo: 'unica', nivel: null, regla: limpio === canonica ? null : 'categoria_normalizada' };
    }
    if (clave === 'CATEGORIA UNO') return { categoria: limpio, simbolo: null, nivel: null, regla: 'categoria_uno' };

    const estrellas = /^([1-5]) ESTRELLAS?$/.exec(clave);
    if (estrellas) return { categoria: limpio, simbolo: 'estrellas', nivel: Number(estrellas[1]), regla: null };

    const otros = /^([1-5]) [A-Z]+ (TENEDOR(?:ES)?|COPAS?|TAZAS?)$/.exec(clave);
    if (otros) {
        const palabra = otros[2] as string;
        const simbolo: SimboloCategoria = palabra.startsWith('TENEDOR') ? 'tenedores' : palabra.startsWith('COPA') ? 'copas' : 'tazas';
        return { categoria: limpio, simbolo, nivel: Number(otros[1]), regla: null };
    }
    return { categoria: limpio, simbolo: null, nivel: null, regla: 'categoria_desconocida' };
}

/**
 * Valida y normaliza el texto de un CSV del Catastro Turistico.
 * Es una funcion pura: no toca la base de datos ni el archivo; solo recibe texto y devuelve resultados.
 * ERROR = la fila no se puede usar (se excluye y la carga no pasa a validada).
 * ALERTA = la fila se usa, pero queda anotado lo que se corrigio o lo que conviene revisar.
 */
export function procesarCatastro(texto: string): ResultadoCatastro {
    const hallazgos: Hallazgo[] = [];
    const registros: RegistroCatastro[] = [];
    const contar = (): ResultadoCatastro['totalErrores'] => hallazgos.filter((h) => h.severidad === 'error').length;
    const terminar = (totalFilas: number): ResultadoCatastro => ({
        totalFilas,
        registros,
        hallazgos,
        totalErrores: contar(),
        totalAlertas: hallazgos.length - contar(),
    });

    const filas = leerCsv(texto);
    const encabezado = filas[0];
    if (encabezado === undefined) {
        hallazgos.push({ fila: null, columna: null, regla: 'archivo_vacio', severidad: 'error', mensaje: 'El archivo no tiene contenido', valorOriginal: null, valorCorregido: null });
        return terminar(0);
    }

    // Ubicar cada columna por su nombre (sin importar tildes, mayusculas ni el orden)
    const indice = {} as Record<Columna, number>;
    for (const columna of Object.keys(COLUMNAS) as Columna[]) {
        const posicion = encabezado.findIndex((h) => claveComparable(h) === COLUMNAS[columna]);
        if (posicion < 0) {
            hallazgos.push({ fila: null, columna: COLUMNAS[columna], regla: 'columna_faltante', severidad: 'error', mensaje: `Falta la columna ${COLUMNAS[columna]}`, valorOriginal: null, valorCorregido: null });
        }
        indice[columna] = posicion;
    }
    if (hallazgos.length > 0) return terminar(Math.max(filas.length - 1, 0));

    const nombreColumna = (c: Columna): string => (encabezado[indice[c]] ?? COLUMNAS[c]).trim();
    const registrosVistos = new Map<string, number>(); // numero de registro -> fila
    const parecidosVistos = new Map<string, { fila: number; registro: string }>();

    for (let n = 1; n < filas.length; n++) {
        const celdas = filas[n] as string[];
        const fila = n;
        let hayError = false;

        const agregar = (c: Columna | null, regla: string, severidad: Severidad, mensaje: string, original: string | null = null, corregido: string | null = null): void => {
            if (severidad === 'error') hayError = true;
            const oculto = c !== null && COLUMNAS_SENSIBLES.includes(c);
            hallazgos.push({
                fila,
                columna: c === null ? null : nombreColumna(c),
                regla,
                severidad,
                mensaje,
                valorOriginal: oculto || original === null ? null : recortar(original),
                valorCorregido: oculto || corregido === null ? null : recortar(corregido),
            });
        };

        if (celdas.length !== encabezado.length) {
            agregar(null, 'fila_columnas', 'error', `La fila tiene ${celdas.length} columnas y se esperaban ${encabezado.length}`);
            continue;
        }

        // Lee una celda, quita espacios sobrantes y avisa si los tenia
        const leer = (c: Columna): string => {
            const crudo = celdas[indice[c]] ?? '';
            const limpio = limpiarEspacios(crudo);
            if (limpio !== crudo && limpio !== '') agregar(c, 'espacios_extra', 'alerta', 'Tenia espacios de mas', crudo, limpio);
            return limpio;
        };

        const ruc = leer('ruc');
        const registro = leer('registro');
        const nombre = leer('nombre');
        const actividad = leer('actividad');
        const clasificacion = leer('clasificacion');
        const categoriaTexto = leer('categoria');
        const propietario = leer('propietario');
        const provincia = leer('provincia');
        const cantonTexto = leer('canton');
        const parroquiaTexto = leer('parroquia');
        const estado = leer('estado');

        // ---- Errores: la fila no se puede usar ----
        if (!/^\d{13}$/.test(ruc)) agregar('ruc', 'ruc_formato', 'error', 'El RUC debe tener 13 digitos');
        if (registro === '') {
            agregar('registro', 'registro_vacio', 'error', 'Falta el numero de registro');
        } else if (!FORMATO_REGISTRO.test(registro)) {
            agregar('registro', 'registro_formato', 'error', 'El numero de registro no tiene el formato esperado (RUC.000.0000000)', registro);
        } else {
            const anterior = registrosVistos.get(registro);
            if (anterior !== undefined) {
                agregar('registro', 'registro_duplicado', 'error', `El numero de registro ya aparece en la fila ${anterior}`, registro);
            } else {
                registrosVistos.set(registro, fila);
            }
        }
        const valores: Partial<Record<Columna, string>> = {
            nombre,
            registro,
            actividad,
            clasificacion,
            categoria: categoriaTexto,
            propietario,
            canton: cantonTexto,
            parroquia: parroquiaTexto,
            estado,
        };
        for (const c of ['actividad', 'clasificacion', 'categoria', 'canton', 'parroquia', 'estado'] as const) {
            if (valores[c] === '') agregar(c, 'campo_obligatorio_vacio', 'error', 'Este campo es obligatorio y viene vacio');
        }
        for (const [c, maximo] of Object.entries(LARGO_MAXIMO) as Array<[Columna, number]>) {
            const valor = valores[c] ?? '';
            if (valor.length > maximo) agregar(c, 'valor_muy_largo', 'error', `El valor supera los ${maximo} caracteres`, valor);
        }
        if (claveComparable(provincia) !== PROVINCIA) {
            agregar('provincia', 'provincia_distinta', 'error', `La provincia debe ser ${PROVINCIA}`, provincia);
        }

        // ---- Alertas: la fila se usa, pero queda anotado ----
        if (FORMATO_REGISTRO.test(registro) && /^\d{13}$/.test(ruc) && !registro.startsWith(`${ruc}.`)) {
            agregar('registro', 'registro_ruc_no_coincide', 'alerta', 'El numero de registro no empieza con el RUC del establecimiento', registro);
        }
        if (nombre === '') agregar('nombre', 'nombre_vacio', 'alerta', 'El establecimiento no tiene nombre comercial');
        if (propietario === '') agregar('propietario', 'propietario_vacio', 'alerta', 'El establecimiento no tiene propietario');

        const categoria = interpretarCategoria(categoriaTexto);
        if (categoriaTexto !== '') {
            if (categoria.regla === 'categoria_normalizada') {
                agregar('categoria', 'categoria_normalizada', 'alerta', 'La categoria se escribio de otra forma y se unifico', categoriaTexto, categoria.categoria);
            } else if (categoria.regla === 'categoria_uno') {
                agregar('categoria', 'categoria_uno', 'alerta', 'La categoria "Uno" no es una de las categorias habituales; se conserva tal cual', categoriaTexto);
            } else if (categoria.regla === 'categoria_desconocida') {
                agregar('categoria', 'categoria_desconocida', 'alerta', 'No se reconoce el tipo de categoria; se conserva tal cual', categoriaTexto);
            }
        }

        const canton = resolverCanton(cantonTexto);
        const cantonFinal = canton.valor ?? cantonTexto;
        if (cantonTexto !== '' && canton.estado === 'desconocida') {
            agregar('canton', 'canton_desconocido', 'alerta', 'El canton no esta en la division oficial de Santa Elena', cantonTexto);
        } else if (canton.estado === 'normalizada') {
            agregar('canton', 'canton_normalizado', 'alerta', 'El canton se escribio distinto al oficial', cantonTexto, cantonFinal);
        }

        let parroquiaFinal = parroquiaTexto;
        if (parroquiaTexto !== '' && canton.valor !== null) {
            const parroquia = resolverParroquia(canton.valor, parroquiaTexto);
            if (parroquia.valor !== null) parroquiaFinal = parroquia.valor;
            if (parroquia.estado === 'normalizada') {
                agregar('parroquia', 'parroquia_normalizada', 'alerta', 'La parroquia se escribio distinto al nombre oficial', parroquiaTexto, parroquiaFinal);
            } else if (parroquia.estado === 'corregida') {
                agregar('parroquia', 'parroquia_corregida', 'alerta', 'La parroquia tenia un error de escritura conocido y se corrigio', parroquiaTexto, parroquiaFinal);
            } else if (parroquia.estado === 'desconocida') {
                agregar('parroquia', 'parroquia_desconocida', 'alerta', `La parroquia no pertenece al canton ${canton.valor} en la division oficial`, parroquiaTexto);
            }
        }

        const claveEstado = claveComparable(estado);
        if (claveEstado.startsWith('PENDIENTE')) {
            agregar('estado', 'pendiente_inspeccion', 'alerta', 'El establecimiento esta pendiente de inspeccion', estado);
        } else if (estado !== '' && claveEstado !== 'RATIFICADO') {
            agregar('estado', 'estado_desconocido', 'alerta', 'El estado del registro no es uno de los habituales', estado);
        }

        // Posible repeticion: mismo RUC, nombre, parroquia y clasificacion con otro numero de registro
        if (nombre !== '' && !hayError) {
            const parecido = [ruc, claveComparable(nombre), claveComparable(parroquiaFinal), claveComparable(clasificacion)].join('|');
            const previo = parecidosVistos.get(parecido);
            if (previo !== undefined) {
                agregar(null, 'posible_duplicado', 'alerta', `Se parece a la fila ${previo.fila} (registro ${previo.registro}): mismo RUC, nombre, parroquia y clasificacion`);
            } else {
                parecidosVistos.set(parecido, { fila, registro });
            }
        }

        if (hayError) continue;
        registros.push({
            filaOrigen: fila,
            numeroRegistro: registro,
            ruc,
            nombreComercial: nombre === '' ? null : nombre,
            actividad,
            clasificacion,
            categoria: categoria.categoria,
            categoriaOriginal: categoriaTexto,
            categoriaSimbolo: categoria.simbolo,
            categoriaNivel: categoria.nivel,
            propietario: propietario === '' ? null : propietario,
            provincia: PROVINCIA,
            canton: cantonFinal,
            parroquia: parroquiaFinal,
            parroquiaOriginal: parroquiaTexto,
            estadoRegistro: estado,
        });
    }
    return terminar(filas.length - 1);
}
