import { z } from 'zod';

/**
 * Roles que se pueden asignar desde la API. "super_admin" no esta: esa cuenta solo se crea con el script
 * crear-admin y no se modifica desde la plataforma (asi nunca se pierde el ultimo administrador).
 */
export const ROLES_ASIGNABLES = ['admin', 'investigador', 'externo'] as const;
export type RolAsignable = (typeof ROLES_ASIGNABLES)[number];

// Para filtrar la lista si se puede pedir tambien super_admin
const ROLES_FILTRO = ['super_admin', ...ROLES_ASIGNABLES] as const;

// Igual que en Fuentes: el estado se dice con palabras
const ESTADOS = ['activa', 'inactiva'] as const;

const vacioAUndefined = (valor: unknown): unknown =>
    typeof valor === 'string' && valor.trim() === '' ? undefined : valor;

export const idUsuarioParamSchema = z.object({
    id: z.coerce
        .number({ error: 'El id del usuario no es valido' })
        .int({ error: 'El id del usuario no es valido' })
        .positive({ error: 'El id del usuario no es valido' }),
});

export const listarUsuariosQuerySchema = z
    .object({
        rol: z.preprocess(vacioAUndefined, z.enum(ROLES_FILTRO, { error: 'El rol no es valido' }).optional()),
        estado: z.preprocess(vacioAUndefined, z.enum(ESTADOS, { error: 'El estado debe ser activa o inactiva' }).optional()),
        texto: z.preprocess(
            vacioAUndefined,
            z
                .string({ error: 'El texto de busqueda no es valido' })
                .trim()
                .max(100, { error: 'El texto de busqueda no puede pasar de 100 caracteres' })
                .optional(),
        ),
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
    })
    // el filtro por estado llega con palabras y el repositorio lo recibe como verdadero o falso
    .transform(({ estado, ...resto }) => (estado === undefined ? resto : { ...resto, activo: estado === 'activa' }));

// strictObject: un campo que no existe (por ejemplo "id" o "actor") se rechaza, no se ignora
export const cambiarRolSchema = z.strictObject({
    rol: z.enum(ROLES_ASIGNABLES, { error: 'El rol debe ser admin, investigador o externo' }),
});

export const cambiarEstadoSchema = z.strictObject({
    estado: z.enum(ESTADOS, { error: 'El estado debe ser activa o inactiva' }),
});

export type ListarUsuariosQuery = z.output<typeof listarUsuariosQuerySchema>;
export type CambiarRolInput = z.infer<typeof cambiarRolSchema>;
export type CambiarEstadoInput = z.infer<typeof cambiarEstadoSchema>;
