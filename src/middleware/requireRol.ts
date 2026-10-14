import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

/**
 * Permite el paso solo a los roles indicados. Debe ir DESPUES de requireAuth.
 * Si no se indica ningun rol, nadie pasa (ante la duda, se niega el acceso).
 */
export function requireRol(...rolesPermitidos: string[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) throw new AppError('No has iniciado sesion', 401, 'NO_AUTENTICADO');
        if (!rolesPermitidos.includes(req.user.rol)) {
            throw new AppError('No tienes permiso para realizar esta accion', 403, 'SIN_PERMISO');
        }
        next();
    };
}