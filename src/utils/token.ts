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

// Devuelve el id del usuario o null si el token es invalido, manipulado o expiro
export function verificarSesion(token: string): number | null {
    try {
        const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER });
        if (typeof payload === 'string' || !payload.sub) return null;
        const id = Number(payload.sub);
        return Number.isInteger(id) && id > 0 ? id : null;
    } catch {
        return null;
    }
}