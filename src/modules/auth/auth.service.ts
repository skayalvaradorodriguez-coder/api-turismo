import { AppError } from '../../utils/AppError';
import { getHashSenuelo, verifyPassword } from '../../utils/password';
import * as repo from './auth.repository';
import type { UsuarioRow } from './auth.repository';
import type { AuthUser } from './auth.types';

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

// Mismo mensaje y mismo codigo para: correo inexistente, contrasena incorrecta y cuenta bloqueada.
// Asi nadie puede descubrir que correos existen.
const credencialesInvalidas = (): AppError =>
    new AppError('Correo o contrasena incorrectos, o cuenta bloqueada temporalmente', 401, 'CREDENCIALES_INVALIDAS');

export function aAuthUser(u: UsuarioRow): AuthUser {
    return { id: u.id, nombres: u.nombres, apellidos: u.apellidos, email: u.email, rol: u.rol_codigo };
}

export async function login(email: string, password: string): Promise<AuthUser> {
    const usuario = await repo.buscarPorEmail(email);

    // La verificacion se ejecuta SIEMPRE (con hash senuelo si no hay usuario): tiempo de respuesta uniforme
    const hash = usuario?.password_hash ?? (await getHashSenuelo());
    const passwordOk = await verifyPassword(hash, password);

    if (!usuario) throw credencialesInvalidas();
    if (usuario.bloqueado) throw credencialesInvalidas(); // no se suma ni se alarga el bloqueo

    // Bloqueo ya vencido: se reinicia el contador
    if (usuario.intentos_fallidos >= MAX_INTENTOS) await repo.limpiarBloqueo(usuario.id);

    if (!usuario.password_hash || !passwordOk) {
        await repo.registrarFallo(usuario.id, MAX_INTENTOS, MINUTOS_BLOQUEO);
        throw credencialesInvalidas();
    }

    // Desde aqui la contrasena es correcta: ya se pueden dar mensajes especificos
    if (!usuario.activo) {
        throw new AppError('Tu cuenta esta desactivada. Contacta al administrador.', 403, 'CUENTA_INACTIVA');
    }
    if (!usuario.email_verificado_at) {
        throw new AppError('Debes verificar tu correo antes de iniciar sesion.', 403, 'EMAIL_NO_VERIFICADO');
    }

    await repo.registrarLoginExitoso(usuario.id);
    return aAuthUser(usuario);
}

// Para validar una sesion existente
export async function usuarioDeSesion(id: number, emitidoEn: number): Promise<AuthUser | null> {
    const usuario = await repo.buscarPorId(id);
    if (!usuario || !usuario.activo) return null;

    // Si la contrasena se cambio despues de emitirse este token, la sesion ya no vale
    if (usuario.sesiones_desde !== null && emitidoEn <= usuario.sesiones_desde) return null;

    return aAuthUser(usuario);
}