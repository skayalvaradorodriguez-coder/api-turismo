import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/AppError';

export function validarBody(schema: z.ZodType) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const resultado = schema.safeParse(req.body ?? {});
        if (!resultado.success) {
            throw new AppError(
                'Los datos enviados no son validos',
                422,
                'VALIDACION',
                resultado.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
            );
        }
        req.body = resultado.data;
        next();
    };
}


/** Valida datos que no vienen en el cuerpo (parametros de la URL, filtros) y devuelve el resultado ya limpio. */
export function validarDatos<T extends z.ZodType>(schema: T, datos: unknown): z.output<T> {
    const resultado = schema.safeParse(datos);
    if (!resultado.success) {
        throw new AppError(
            'Los datos enviados no son validos',
            422,
            'VALIDACION',
            resultado.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
        );
    }
    return resultado.data;
}