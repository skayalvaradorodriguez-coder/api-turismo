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