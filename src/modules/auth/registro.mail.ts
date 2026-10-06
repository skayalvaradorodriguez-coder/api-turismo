import type { Correo } from '../../utils/mailer';

export const NOMBRE = 'Observatorio Turístico Sostenible';

export function escaparHtml(texto: string): string {
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function plantilla(titulo: string, parrafos: string[], boton: { texto: string; url: string } | null, pie: string): string {
    const cuerpo = parrafos.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1f3a3a;">${p}</p>`).join('');
    const accion = boton
        ? `<p style="margin:28px 0;"><a href="${escaparHtml(boton.url)}" style="display:inline-block;padding:14px 28px;background:#0d7570;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;border-radius:12px;">${escaparHtml(boton.texto)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#4a6663;">Si el botón no funciona, copia este enlace en tu navegador:<br /><span style="word-break:break-all;color:#0d7570;">${escaparHtml(boton.url)}</span></p>`
        : '';
    return `<!DOCTYPE html>
<html lang="es"><body style="margin:0;padding:24px 12px;background:#f0f9f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #cfe5e3;">
      <tr><td style="background:#145a55;padding:24px 32px;">
        <div style="font-size:18px;font-weight:700;color:#ffffff;">${NOMBRE}</div>
        <div style="margin-top:10px;width:48px;height:3px;background:#e8b009;"></div>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 20px;font-size:24px;color:#1f3a3a;">${titulo}</h1>
        ${cuerpo}${accion}
        <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#4a6663;">${pie}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function correoVerificacion(nombres: string, enlace: string): Omit<Correo, 'para'> {
    const nombre = escaparHtml(nombres);
    return {
        asunto: `Confirma tu correo · ${NOMBRE}`,
        html: plantilla(
            'Confirma tu correo',
            [`Hola ${nombre},`, 'Gracias por crear tu cuenta. Para activarla, confirma tu correo electrónico. El enlace es válido por 24 horas y solo puede usarse una vez.'],
            { texto: 'Confirmar correo', url: enlace },
            'Si no creaste esta cuenta, puedes ignorar este mensaje: no se activará nada.',
        ),
        texto: `Hola ${nombres},\n\nGracias por crear tu cuenta en ${NOMBRE}. Para activarla, confirma tu correo con este enlace (válido por 24 horas, de un solo uso):\n\n${enlace}\n\nSi no creaste esta cuenta, ignora este mensaje.`,
    };
}

export function correoCuentaExistente(nombres: string, urlLogin: string, urlRecuperar: string): Omit<Correo, 'para'> {
    const nombre = escaparHtml(nombres);
    return {
        asunto: `Ya tienes una cuenta · ${NOMBRE}`,
        html: plantilla(
            'Ya tienes una cuenta',
            [
                `Hola ${nombre},`,
                'Alguien intentó crear una cuenta con tu correo, pero ya existe una. Puedes iniciar sesión normalmente.',
                `Si olvidaste tu contraseña, puedes <a href="${escaparHtml(urlRecuperar)}" style="color:#0d7570;">recuperarla aquí</a>.`,
            ],
            { texto: 'Iniciar sesión', url: urlLogin },
            'Si no fuiste tú, no tienes que hacer nada: tu cuenta sigue segura.',
        ),
        texto: `Hola ${nombres},\n\nAlguien intentó crear una cuenta con tu correo, pero ya existe una. Inicia sesión en: ${urlLogin}\nSi olvidaste tu contraseña: ${urlRecuperar}\n\nSi no fuiste tú, no tienes que hacer nada.`,
    };
}