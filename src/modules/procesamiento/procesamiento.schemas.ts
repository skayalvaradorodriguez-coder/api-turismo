import { z } from 'zod';

// Los parametros de la URL y de la consulta llegan como texto: se convierten y se validan aqui
const vacioAUndefined = (valor: unknown): unknown =>
    typeof valor === 'string' && valor.trim() === '' ? undefined : valor;

const entero = (etiqueta: string) =>
    z.coerce
        .number({ error: `${etiqueta} no es valido` })
        .int({ error: `${etiqueta} no es valido` })
        .positive({ error: `${etiqueta} no es valido` });

const textoFiltro = (etiqueta: string, max: number) =>
    z.preprocess(
        vacioAUndefined,
        z
            .string({ error: `${etiqueta} no es valido` })
            .trim()
            .max(max, { error: `${etiqueta} no puede pasar de ${max} caracteres` })
            .optional(),
    );

const paginacion = {
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
};

export const cargaParamSchema = z.object({ id: entero('El id de la carga') });

export const procesamientoParamSchema = z.object({
    id: entero('El id de la carga'),
    procesamientoId: entero('El id del procesamiento'),
});

export const listarHallazgosQuerySchema = z.object({
    severidad: z.preprocess(vacioAUndefined, z.enum(['error', 'alerta'], { error: 'La severidad no es valida' }).optional()),
    regla: z.preprocess(
        vacioAUndefined,
        z
            .string({ error: 'La regla no es valida' })
            .regex(/^[a-z_]{1,60}$/, { error: 'La regla no es valida' })
            .optional(),
    ),
    ...paginacion,
});

export const listarRegistrosQuerySchema = z.object({
    canton: textoFiltro('El canton', 100),
    parroquia: textoFiltro('La parroquia', 100),
    clasificacion: textoFiltro('La clasificacion', 100),
    // solo "true" o "false": cualquier otro valor se rechaza
    sensibles: z.preprocess(
        vacioAUndefined,
        z
            .enum(['true', 'false'], { error: 'El valor de "sensibles" debe ser true o false' })
            .default('false')
            .transform((valor) => valor === 'true'),
    ),
    ...paginacion,
});

export type ListarHallazgosQuery = z.infer<typeof listarHallazgosQuerySchema>;
export type ListarRegistrosQuery = z.infer<typeof listarRegistrosQuerySchema>;
