import { AppError } from '../../utils/AppError';
import * as auth from './auth.repository';
import { aAuthUser } from './auth.service';
import type { AuthUser } from './auth.types';
import * as repo from './google.repository';
import type { PerfilGoogle } from './google.verifier';
import * as reg from './registro.repository';

const cuentaInactiva = (): AppError =>
    new AppError('Tu cuenta esta desactivada. Contacta al administrador.', 403, 'CUENTA_INACTIVA');

/**
 * Devuelve el id del usuario que corresponde a esta cuenta de Google:
 *  1. Ya vinculada          -> esa cuenta.
 *  2. Mismo correo          -> se vincula (Google ya verifico que el correo es de esa persona).
 *  3. No existe             -> se crea una cuenta nueva con rol 'usuario'.
 */
async function resolverUsuario(perfil: PerfilGoogle): Promise<number> {
    const porSub = await repo.buscarPorSub(perfil.sub);
    if (porSub) return porSub.id;

    const porEmail = await repo.buscarPorEmail(perfil.email);
    if (porEmail) {
        // Ese correo ya esta vinculado a OTRA cuenta de Google (por ejemplo, un correo reasignado): no se mezcla
        if (porEmail.google_sub && porEmail.google_sub !== perfil.sub) {
            throw new AppError('Este correo ya esta vinculado a otra cuenta de Google', 403, 'GOOGLE_CUENTA_DISTINTA');
        }
        if (!porEmail.activo) throw cuentaInactiva();

        if (!porEmail.google_sub) {
            if (porEmail.email_verificado_at) {
                await repo.vincularCuentaVerificada(porEmail.id, perfil.sub);
            } else {
                await repo.vincularCuentaPendiente(porEmail.id, perfil.sub);
                await reg.invalidarTokens(porEmail.id, 'verificar_email'); // los enlaces pendientes ya no sirven
            }
        }
        return porEmail.id;
    }

    try {
        return await repo.crearUsuario({
            nombres: perfil.nombres,
            apellidos: perfil.apellidos,
            email: perfil.email,
            sub: perfil.sub,
        });
    } catch (error) {
        if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
        // Dos solicitudes simultaneas crearon la misma cuenta: se usa la que gano
        const existente = (await repo.buscarPorSub(perfil.sub)) ?? (await repo.buscarPorEmail(perfil.email));
        if (!existente) throw error;
        return existente.id;
    }
}

export async function entrarConGoogle(perfil: PerfilGoogle): Promise<AuthUser> {
    const id = await resolverUsuario(perfil);

    const usuario = await auth.buscarPorId(id);
    if (!usuario || !usuario.activo) throw cuentaInactiva();

    await auth.registrarLoginExitoso(id);
    return aAuthUser(usuario);
}