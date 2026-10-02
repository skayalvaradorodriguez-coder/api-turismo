import { rateLimit } from 'express-rate-limit';

// Limite por IP: solo cuentan los intentos fallidos (los exitosos no)
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
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