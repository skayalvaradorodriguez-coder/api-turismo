import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { verificarSesion } from '../utils/token';
import { usuarioDeSesion } from '../modules/auth/auth.service';

export const COOKIE_NAME = 'wt_session';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token: unknown = req.cookies?.[COOKIE_NAME];
    if (typeof token !== 'string' || !token) {
        throw new AppError('No has iniciado sesion', 401, 'NO_AUTENTICADO');
    }

    const id = verificarSesion(token);
    if (!id) throw new AppError('Tu sesion no es valida o expiro', 401, 'SESION_INVALIDA');

    // Se vuelve a leer el usuario en cada peticion: si lo desactivan, la sesion deja de servir al instante
    const usuario = await usuarioDeSesion(id);
    if (!usuario) throw new AppError('Tu sesion no es valida o expiro', 401, 'SESION_INVALIDA');

    req.user = usuario;
    next();
}