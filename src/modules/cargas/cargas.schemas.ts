import { z } from 'zod';

export const ESTADOS_CARGA = ['recibida', 'validada', 'procesada', 'publicada', 'rechazada'] as const;
export type EstadoCarga = (typeof ESTADOS_CARGA)[number];

// En un formulario con archivo, un campo vacio llega como "": se trata como "no enviado"
const vacioAUndefined = (valor: unknown): unknown =>
    typeof valor === 'string' && valor.trim() === '' ? undefined : valor;

const entero = (etiqueta: string) =>
    z.coerce
        .number({ error: `${etiqueta} no es valido` })
        .int({ error: `${etiqueta} no es valido` })
        .positive({ error: `${etiqueta} no es valido` });

const enteroOpcional = (etiqueta: string) => z.preprocess(vacioAUndefined, entero(etiqueta).optional());

const fechaOpcional = (etiqueta: string) =>
    z.preprocess(vacioAUndefined, z.iso.date({ error: `${etiqueta} debe tener el formato AAAA-MM-DD` }).optional());

// Texto opcional: si llega vacio o solo con espacios, se guarda como null
const textoOpcional = (etiqueta: string, max: number) =>
    z
        .string({ error: `${etiqueta} no es valido` })
        .trim()
        .max(max, { error: `${etiqueta} no puede pasar de ${max} caracteres` })
        .nullish()
        .transform((valor) => (valor ? valor : null));

// ---------------------------------------------------------------
// Metadatos: pares nombre / valor. Los valores se guardan siempre como texto.
// ---------------------------------------------------------------
const MAX_METADATOS = 50;
const NOMBRES_PROHIBIDOS = new Set(['__proto__', 'constructor', 'prototype']);

const nombreMetadato = z
    .string()
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,79}$/u, { error: 'El nombre de un metadato no es valido' })
    .refine((nombre) => nombre === nombre.trim() && !NOMBRES_PROHIBIDOS.has(nombre), {
        error: 'El nombre de un metadato no es valido',
    });

const valorMetadato = z
    .union([
        z
            .string()
            .trim()
            .min(1, { error: 'Un metadato no puede estar vacio' })
            .max(1000, { error: 'Un metadato no puede pasar de 1000 caracteres' }),
        z.number(),
        z.boolean(),
    ])
    .transform((valor) => String(valor));

export const metadatosSchema = z
    .record(nombreMetadato, valorMetadato)
    .refine((metadatos) => Object.keys(metadatos).length <= MAX_METADATOS, {
        error: `Se permiten como maximo ${MAX_METADATOS} metadatos`,
    });

// En el formulario con archivo, los metadatos viajan como un texto JSON: {"cobertura": "Provincia"}
const metadatosDesdeTexto = z.preprocess((valor) => {
    if (valor === undefined || (typeof valor === 'string' && valor.trim() === '')) return undefined;
    if (typeof valor !== 'string') return valor;
    try {
        const analizado: unknown = JSON.parse(valor);
        // JSON.parse crea "__proto__" como una clave comun: se rechaza de forma explicita
        if (typeof analizado === 'object' && analizado !== null && Object.hasOwn(analizado, '__proto__')) {
            return 'nombre-no-permitido';
        }
        return analizado;
    } catch {
        return 'no-es-json';
    }
}, metadatosSchema.default({}));

// ---------------------------------------------------------------
// Esquemas de las operaciones
// ---------------------------------------------------------------

// strictObject: un campo que no existe (por ejemplo "estado" o "cargadoPor") se rechaza, no se ignora
export const crearCargaSchema = z
    .strictObject({
        fuenteId: entero('El id de la fuente'),
        estructuraId: enteroOpcional('El id de la estructura'),
        descripcion: textoOpcional('La descripcion', 2000),
        periodoDesde: fechaOpcional('El inicio del periodo'),
        periodoHasta: fechaOpcional('El fin del periodo'),
        nivelIngreso: z.preprocess(
            vacioAUndefined,
            z.coerce
                .number({ error: 'El nivel de ingreso debe ser 1, 2 o 3' })
                .int({ error: 'El nivel de ingreso debe ser 1, 2 o 3' })
                .min(1, { error: 'El nivel de ingreso debe ser 1, 2 o 3' })
                .max(3, { error: 'El nivel de ingreso debe ser 1, 2 o 3' })
                .default(1),
        ),
        metadatos: metadatosDesdeTexto,
    })
    .refine((datos) => !datos.periodoDesde || !datos.periodoHasta || datos.periodoHasta >= datos.periodoDesde, {
        path: ['periodoHasta'],
        error: 'El fin del periodo no puede ser anterior al inicio',
    });

export const rechazarCargaSchema = z.strictObject({
    motivo: z
        .string({ error: 'El motivo es obligatorio' })
        .trim()
        .min(5, { error: 'El motivo debe tener al menos 5 caracteres' })
        .max(1000, { error: 'El motivo no puede pasar de 1000 caracteres' }),
});

// Solo agrega o cambia metadatos: la base no permite borrarlos
export const actualizarMetadatosSchema = z.strictObject({
    metadatos: metadatosSchema.refine((metadatos) => Object.keys(metadatos).length > 0, {
        error: 'Indica al menos un metadato',
    }),
});

export const listarCargasQuerySchema = z.object({
    fuenteId: enteroOpcional('El id de la fuente'),
    estado: z.preprocess(vacioAUndefined, z.enum(ESTADOS_CARGA, { error: 'El estado no es valido' }).optional()),
    limite: z.preprocess(
        vacioAUndefined,
        z.coerce
            .number({ error: 'El limite no es valido' })
            .int({ error: 'El limite no es valido' })
            .min(1, { error: 'El limite debe estar entre 1 y 200' })
            .max(200, { error: 'El limite debe estar entre 1 y 200' })
            .default(50),
    ),
    pagina: z.preprocess(
        vacioAUndefined,
        z.coerce
            .number({ error: 'La pagina no es valida' })
            .int({ error: 'La pagina no es valida' })
            .min(1, { error: 'La pagina no es valida' })
            .max(100000, { error: 'La pagina no es valida' })
            .default(1),
    ),
});

export const idCargaParamSchema = z.object({ id: entero('El id de la carga') });

export const archivoParamSchema = z.object({
    id: entero('El id de la carga'),
    archivoId: entero('El id del archivo'),
});

export type CrearCargaInput = z.infer<typeof crearCargaSchema>;
export type RechazarCargaInput = z.infer<typeof rechazarCargaSchema>;
export type ActualizarMetadatosInput = z.infer<typeof actualizarMetadatosSchema>;
export type ListarCargasQuery = z.infer<typeof listarCargasQuerySchema>;