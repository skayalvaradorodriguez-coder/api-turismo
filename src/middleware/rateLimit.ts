import { rateLimit } from 'express-rate-limit';

function limitador(opciones: { minutos: number; limite: number; soloFallidos?: boolean }) {
    return rateLimit({
        windowMs: opciones.minutos * 60 * 1000,
        limit: opciones.limite,
        skipSuccessfulRequests: opciones.soloFallidos ?? false,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_req, res) => {
            res.status(429).json({
                ok: false,
                code: 'DEMASIADOS_INTENTOS',
                message: 'Demasiados intentos. Intenta de nuevo en unos minutos.',
            });
        },
    });
}

// Limite por IP. En el login solo cuentan los intentos fallidos.
export const loginLimiter = limitador({ minutos: 15, limite: 20, soloFallidos: true });
export const registroLimiter = limitador({ minutos: 60, limite: 10 });
export const correoLimiter = limitador({ minutos: 15, limite: 5 });
export const verificacionLimiter = limitador({ minutos: 15, limite: 30, soloFallidos: true });