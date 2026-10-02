import * as argon2 from 'argon2';

// argon2id con parametros recomendados por OWASP (o superiores)
const OPCIONES = {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 1,
} as const;

export function hashPassword(plano: string): Promise<string> {
    return argon2.hash(plano, OPCIONES);
}

export async function verifyPassword(hash: string, plano: string): Promise<boolean> {
    try {
        return await argon2.verify(hash, plano);
    } catch {
        return false;
    }
}

// Hash "senuelo": se usa cuando el usuario no existe para que la respuesta tarde lo mismo
// que cuando existe y no se pueda descubrir que correos estan registrados por el tiempo.
let senuelo: Promise<string> | undefined;
export function getHashSenuelo(): Promise<string> {
    senuelo ??= argon2.hash('contrasena-senuelo-no-usar', OPCIONES);
    return senuelo;
}