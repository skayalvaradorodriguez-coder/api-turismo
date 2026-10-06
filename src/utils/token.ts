import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const ISSUER = 'api-turismo';

export function firmarSesion(usuarioId: number): string {
    return jwt.sign({}, env.JWT_SECRET, {
        algorithm: 'HS256',
        subject: String(usuarioId),
        issuer: ISSUER,
        expiresIn: env.SESSION_MINUTES * 60,
    });
}

export interface SesionToken {
    id: number;
    /** Momento en que se emitio el token (segundos desde 1970). */
    emitidoEn: number;
}

// Devuelve la sesion o null si el token es invalido, manipulado o expiro
export function verificarSesion(token: string): SesionToken | null {
    try {
        const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER });
        if (typeof payload === 'string' || !payload.sub || typeof payload.iat !== 'number') return null;
        const id = Number(payload.sub);
        return Number.isInteger(id) && id > 0 ? { id, emitidoEn: payload.iat } : null;
    } catch {
        return null;
    }
}