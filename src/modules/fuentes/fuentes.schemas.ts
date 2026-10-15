import { z } from 'zod';

const textoRequerido = (etiqueta: string, min: number, max: number) =>
    z
        .string({ error: `${etiqueta} es obligatorio` })
        .trim()
        .min(min, { error: `${etiqueta} debe tener al menos ${min} caracteres` })
        .max(max, { error: `${etiqueta} no puede pasar de ${max} caracteres` });

// Opcional: si llega vacio o solo con espacios, se guarda como null
const textoOpcional = (etiqueta: string, max: number) =>
    z
        .string({ error: `${etiqueta} no es valido` })
        .trim()
        .max(max, { error: `${etiqueta} no puede pasar de ${max} caracteres` })
        .nullish()
        .transform((valor) => (valor ? valor : null));

// Campos que se pueden editar. El codigo NO esta aqui: no cambia despues de crear la fuente.
const camposEditables = {
    nombre: textoRequerido('El nombre', 3, 150),
    institucion: textoRequerido('La institucion', 2, 150),
    descripcion: textoOpcional('La descripcion', 2000),
    tipoFuente: textoOpcional('El tipo de fuente', 40),
    mecanismoAcceso: textoOpcional('El mecanismo de acceso', 40),
    frecuenciaActualizacion: textoOpcional('La frecuencia de actualizacion', 60),
    procedencia: textoOpcional('La procedencia', 2000),
    licenciaUso: textoOpcional('La licencia o condicion de uso', 200),
    responsable: textoOpcional('El responsable', 150),
};

// strictObject: si llega un campo que no existe, se rechaza (no se ignora en silencio)
export const crearFuenteSchema = z.strictObject({
    codigo: z
        .string({ error: 'El codigo es obligatorio' })
        .trim()
        .min(3, { error: 'El codigo debe tener al menos 3 caracteres' })
        .max(40, { error: 'El codigo no puede pasar de 40 caracteres' })
        .regex(/^[a-z][a-z0-9_]*$/, {
            error: 'El codigo solo admite minusculas, numeros y guion bajo, y debe empezar con una letra',
        }),
    ...camposEditables,
});

export const editarFuenteSchema = z.strictObject({ ...camposEditables });

export const cambiarEstadoSchema = z.strictObject({
    estado: z.enum(['activa', 'inactiva'], { error: 'El estado debe ser activa o inactiva' }),
});

export type CrearFuenteInput = z.infer<typeof crearFuenteSchema>;
export type EditarFuenteInput = z.infer<typeof editarFuenteSchema>;
export type CambiarEstadoInput = z.infer<typeof cambiarEstadoSchema>;


export const idParamSchema = z.object({
    id: z.coerce
        .number({ error: 'El id no es valido' })
        .int({ error: 'El id no es valido' })
        .positive({ error: 'El id no es valido' }),
});

export const listarFuentesQuerySchema = z.object({
    estado: z.enum(['activa', 'inactiva'], { error: 'El estado debe ser activa o inactiva' }).optional(),
});