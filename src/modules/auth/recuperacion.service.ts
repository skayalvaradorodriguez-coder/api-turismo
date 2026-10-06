import { env, isProd } from '../../config/env';
import { generarToken, hashToken } from '../../utils/emailToken';
import { enviarCorreo } from '../../utils/mailer';
import { hashPassword } from '../../utils/password';
import { AppError } from '../../utils/AppError';
import * as auth from './auth.repository';
import { correoPasswordCambiada, correoRecuperacion } from './recuperacion.mail';
import * as rec from './recuperacion.repository';
import type { RestablecerInput } from './recuperacion.schemas';
import * as reg from './registro.repository';

const VIGENCIA_RECUPERACION_MIN = 30;
const ESPERA_REENVIO_SEG = 60;

const urlFront = (ruta: string): string => `${env.FRONTEND_URL.replace(/\/$/, '')}${ruta}`;

function enSegundoPlano(tarea: Promise<void>, descripcion: string): void {
    tarea.catch((error: unknown) => {
        console.error(`[correo] No se pudo ${descripcion}:`, error instanceof Error ? error.message : error);
    });
}

const tokenInvalido = (): AppError =>
    new AppError('El enlace no es valido, expiro o ya fue usado', 400, 'TOKEN_INVALIDO');

async function enviarRecuperacion(usuarioId: number, nombres: string, email: string): Promise<void> {
    const token = generarToken();
    await reg.invalidarTokens(usuarioId, 'recuperar_password'); // solo el enlace mas reciente sirve
    await reg.crearToken(usuarioId, 'recuperar_password', hashToken(token), VIGENCIA_RECUPERACION_MIN);

    const enlace = urlFront(`/restablecer?token=${token}`);
    if (!isProd) console.log(`[dev] Enlace de recuperacion para ${email}: ${enlace}`);

    await enviarCorreo({ para: email, ...correoRecuperacion(nombres, enlace) });
}

/**
 * Responde igual exista o no la cuenta (nadie puede averiguar quien esta registrado).
 * Solo se envia correo a cuentas activas y con el correo ya verificado.
 */
export async function solicitarRecuperacion(email: string): Promise<void> {
    const usuario = await auth.buscarPorEmail(email);
    if (!usuario || !usuario.activo || !usuario.email_verificado_at) return;
    if (await reg.hayTokenReciente(usuario.id, 'recuperar_password', ESPERA_REENVIO_SEG)) return;

    enSegundoPlano(enviarRecuperacion(usuario.id, usuario.nombres, usuario.email), 'enviar la recuperacion');
}

/** Para que la pantalla avise "enlace invalido" ANTES de pedir la contrasena nueva. No gasta el token. */
export async function comprobarTokenRecuperacion(token: string): Promise<void> {
    if (!(await rec.tokenVigente('recuperar_password', hashToken(token)))) throw tokenInvalido();
}

export async function restablecerPassword(datos: RestablecerInput): Promise<void> {
    // Se calcula antes de gastar el token: un enlace invalido tarda lo mismo que uno valido
    const passwordHash = await hashPassword(datos.password);

    const usuarioId = await reg.consumirToken('recuperar_password', hashToken(datos.token));
    if (!usuarioId) throw tokenInvalido();

    await rec.actualizarPassword(usuarioId, passwordHash);
    await reg.invalidarTokens(usuarioId, 'recuperar_password');

    const usuario = await auth.buscarPorId(usuarioId);
    if (usuario) {
        enSegundoPlano(
            enviarCorreo({ para: usuario.email, ...correoPasswordCambiada(usuario.nombres, urlFront('/login'), urlFront('/recuperar')) }),
            'avisar del cambio de contrasena',
        );
    }
}