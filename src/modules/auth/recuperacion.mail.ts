import type { Correo } from '../../utils/mailer';
import { NOMBRE, escaparHtml, plantilla } from './registro.mail';

export function correoRecuperacion(nombres: string, enlace: string): Omit<Correo, 'para'> {
    const nombre = escaparHtml(nombres);
    return {
        asunto: `Recupera tu contraseña · ${NOMBRE}`,
        html: plantilla(
            'Recupera tu contraseña',
            [
                `Hola ${nombre},`,
                'Recibimos una solicitud para crear una contraseña nueva en tu cuenta. El enlace es válido por 30 minutos y solo puede usarse una vez.',
            ],
            { texto: 'Crear contraseña nueva', url: enlace },
            'Si no lo solicitaste, ignora este mensaje: tu contraseña actual sigue funcionando y nadie puede cambiarla sin este enlace.',
        ),
        texto: `Hola ${nombres},\n\nRecibimos una solicitud para crear una contraseña nueva en tu cuenta de ${NOMBRE}. Usa este enlace (válido por 30 minutos, de un solo uso):\n\n${enlace}\n\nSi no lo solicitaste, ignora este mensaje: tu contraseña actual sigue funcionando.`,
    };
}

export function correoPasswordCambiada(nombres: string, urlLogin: string, urlRecuperar: string): Omit<Correo, 'para'> {
    const nombre = escaparHtml(nombres);
    return {
        asunto: `Tu contraseña fue cambiada · ${NOMBRE}`,
        html: plantilla(
            'Tu contraseña fue cambiada',
            [
                `Hola ${nombre},`,
                'Te avisamos que la contraseña de tu cuenta se acaba de cambiar y que cerramos tus sesiones abiertas.',
                `Si fuiste tú, no necesitas hacer nada. Si no reconoces este cambio, <a href="${escaparHtml(urlRecuperar)}" style="color:#0d7570;">recupera tu cuenta ahora</a>.`,
            ],
            { texto: 'Iniciar sesión', url: urlLogin },
            'Por seguridad, enviamos este aviso cada vez que cambia la contraseña.',
        ),
        texto: `Hola ${nombres},\n\nLa contraseña de tu cuenta de ${NOMBRE} se acaba de cambiar y cerramos tus sesiones abiertas.\n\nSi fuiste tú, no necesitas hacer nada. Si no reconoces este cambio, recupera tu cuenta: ${urlRecuperar}\n\nIniciar sesión: ${urlLogin}`,
    };
}