import { env, isProd } from '../../config/env';
import { generarToken, hashToken } from '../../utils/emailToken';
import { enviarCorreo } from '../../utils/mailer';
import { hashPassword } from '../../utils/password';
import { AppError } from '../../utils/AppError';
import * as auth from './auth.repository';
import { correoCuentaExistente, correoVerificacion } from './registro.mail';
import * as repo from './registro.repository';
import type { RegistroInput } from './registro.schemas';

const VIGENCIA_VERIFICACION_MIN = 24 * 60;
const ESPERA_REENVIO_SEG = 60;

const urlFront = (ruta: string): string => `${env.FRONTEND_URL.replace(/\/$/, '')}${ruta}`;

// El envio no se espera (fire-and-forget): asi la respuesta tarda lo mismo exista o no el correo
function enSegundoPlano(tarea: Promise<void>, descripcion: string): void {
    tarea.catch((error: unknown) => {
        console.error(`[correo] No se pudo ${descripcion}:`, error instanceof Error ? error.message : error);
    });
}

async function enviarVerificacion(usuarioId: number, nombres: string, email: string): Promise<void> {
    const token = generarToken();
    await repo.invalidarTokens(usuarioId, 'verificar_email'); // solo el enlace mas reciente sirve
    await repo.crearToken(usuarioId, 'verificar_email', hashToken(token), VIGENCIA_VERIFICACION_MIN);

    const enlace = urlFront(`/verificar?token=${token}`);
    if (!isProd) console.log(`[dev] Enlace de verificacion para ${email}: ${enlace}`);

    await enviarCorreo({ para: email, ...correoVerificacion(nombres, enlace) });
}

async function avisarCuentaExistente(nombres: string, email: string): Promise<void> {
    await enviarCorreo({ para: email, ...correoCuentaExistente(nombres, urlFront('/login'), urlFront('/recuperar')) });
}

/**
 * Registro publico. La respuesta es SIEMPRE la misma, exista o no el correo:
 * asi nadie puede usar este formulario para averiguar quien tiene cuenta.
 */
export async function registrar(datos: RegistroInput): Promise<void> {
    // Se calcula siempre (aunque el correo ya exista) para que el tiempo de respuesta no delate nada
    const passwordHash = await hashPassword(datos.password);

    const existente = await auth.buscarPorEmail(datos.email);

    if (existente) {
        if (!existente.email_verificado_at && existente.activo) {
            // Registro pendiente: gana el ultimo y se manda un enlace nuevo
            await repo.actualizarRegistroNoVerificado(existente.id, datos.nombres, datos.apellidos, passwordHash);
            enSegundoPlano(enviarVerificacion(existente.id, datos.nombres, existente.email), 'enviar la verificacion');
        } else if (existente.activo) {
            enSegundoPlano(avisarCuentaExistente(existente.nombres, existente.email), 'avisar de cuenta existente');
        }
        return;
    }

    let id: number;
    try {
        id = await repo.crearUsuario({
            nombres: datos.nombres,
            apellidos: datos.apellidos,
            email: datos.email,
            passwordHash,
        });
    } catch (error) {
        if ((error as { code?: string }).code === 'ER_DUP_ENTRY') return; // otro registro simultaneo con el mismo correo
        throw error;
    }

    enSegundoPlano(enviarVerificacion(id, datos.nombres, datos.email), 'enviar la verificacion');
}

export async function verificarEmail(token: string): Promise<void> {
    const usuarioId = await repo.consumirToken('verificar_email', hashToken(token));
    if (!usuarioId) {
        throw new AppError('El enlace no es valido, expiro o ya fue usado', 400, 'TOKEN_INVALIDO');
    }
    await repo.marcarEmailVerificado(usuarioId);
}

/** Tampoco revela si el correo existe: responde igual en todos los casos. */
export async function reenviarVerificacion(email: string): Promise<void> {
    const usuario = await auth.buscarPorEmail(email);
    if (!usuario || usuario.email_verificado_at || !usuario.activo) return;
    if (await repo.hayTokenReciente(usuario.id, 'verificar_email', ESPERA_REENVIO_SEG)) return;

    enSegundoPlano(enviarVerificacion(usuario.id, usuario.nombres, usuario.email), 'reenviar la verificacion');
}