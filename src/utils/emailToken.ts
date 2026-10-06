import { createHash, randomBytes } from 'node:crypto';

/** Token aleatorio de 256 bits, seguro para ir en un enlace. */
export function generarToken(): string {
    return randomBytes(32).toString('base64url');
}

/** En la base de datos solo se guarda este hash; si la BD se filtra, los enlaces no sirven. */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}