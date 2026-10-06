import { timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { TokenPayload } from 'google-auth-library';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';

// Descarga (y guarda en cache) las claves publicas de Google para comprobar la firma del token
const cliente = new OAuth2Client();

export interface PerfilGoogle {
    /** Identificador estable de la persona en Google (no cambia aunque cambie su correo). */
    sub: string;
    email: string;
    nombres: string;
    apellidos: string;
}

export function exigirGoogleConfigurado(): string {
    if (!env.GOOGLE_CLIENT_ID) {
        throw new AppError('El acceso con Google no esta configurado', 503, 'GOOGLE_NO_CONFIGURADO');
    }
    return env.GOOGLE_CLIENT_ID;
}

// Un solo mensaje para cualquier fallo: no se le explica a un atacante que parte fallo
const credencialInvalida = (): AppError =>
    new AppError('No se pudo verificar tu cuenta de Google. Intentalo de nuevo.', 401, 'GOOGLE_INVALIDO');

function iguales(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

const limpiar = (texto: string | undefined): string =>
    (texto ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);

function nombresDe(payload: TokenPayload, email: string): { nombres: string; apellidos: string } {
    let nombres = limpiar(payload.given_name);
    let apellidos = limpiar(payload.family_name);

    if (!nombres) {
        const partes = limpiar(payload.name).split(' ').filter(Boolean);
        nombres = partes[0] ?? '';
        if (!apellidos) apellidos = partes.slice(1).join(' ');
    }
    if (!nombres) nombres = limpiar(email.split('@')[0]) || 'Usuario';

    return { nombres, apellidos };
}

/**
 * Comprueba que la credencial la firmo Google, que es para ESTA aplicacion, que no expiro,
 * que el correo esta verificado y que pertenece a la solicitud (nonce).
 */
export async function verificarCredencial(credencial: string, nonceEsperado: string | undefined): Promise<PerfilGoogle> {
    const clientId = exigirGoogleConfigurado();
    if (!nonceEsperado) throw credencialInvalida();

    let payload: TokenPayload | undefined;
    try {
        // Valida firma, emisor (accounts.google.com), audiencia (nuestro ID de cliente) y expiracion
        const ticket = await cliente.verifyIdToken({ idToken: credencial, audience: clientId });
        payload = ticket.getPayload();
    } catch {
        throw credencialInvalida();
    }

    if (!payload?.sub || !payload.email || payload.email.length > 190 || payload.email_verified !== true) {
        throw credencialInvalida();
    }

    // El nonce evita que alguien reutilice un token robado: tiene que venir con la cookie de ESTE navegador
    if (typeof payload.nonce !== 'string' || !iguales(payload.nonce, nonceEsperado)) {
        throw credencialInvalida();
    }

    const email = payload.email.trim().toLowerCase();
    return { sub: payload.sub, email, ...nombresDe(payload, email) };
}