import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { isProd } from '../config/env';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            ok: false,
            code: err.code,
            message: err.message,
            details: err.details,
        });
        return;
    }

    // JSON mal formado enviado por el cliente
    if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ ok: false, code: 'JSON_INVALIDO', message: 'El cuerpo de la peticion no es un JSON valido' });
        return;
    }

    // Cualquier otro error es interno: se registra en el servidor y NO se expone al cliente
    console.error('Error no controlado:', err);
    res.status(500).json({
        ok: false,
        code: 'ERROR_INTERNO',
        message: 'Error interno del servidor',
        ...(isProd ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    });
}