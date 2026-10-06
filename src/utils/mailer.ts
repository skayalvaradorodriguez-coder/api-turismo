import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, isProd } from '../config/env';

let transporte: Promise<Transporter> | undefined;

async function crearTransporte(): Promise<Transporter> {
    if (env.SMTP_HOST) {
        const puerto = env.SMTP_PORT ?? 587;
        return nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: puerto,
            secure: puerto === 465,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
        });
    }

    // Desarrollo sin SMTP: Ethereal es un buzon de pruebas gratuito. Los correos NO llegan a nadie,
    // se ven en un enlace que se imprime en la consola.
    const cuenta = await nodemailer.createTestAccount();
    console.log(`[correo] Modo pruebas (Ethereal) con la cuenta ${cuenta.user}`);
    return nodemailer.createTransport({
        host: cuenta.smtp.host,
        port: cuenta.smtp.port,
        secure: cuenta.smtp.secure,
        auth: { user: cuenta.user, pass: cuenta.pass },
    });
}

export interface Correo {
    para: string;
    asunto: string;
    html: string;
    texto: string;
}

export async function enviarCorreo(correo: Correo): Promise<void> {
    if (isProd && !env.SMTP_HOST) throw new Error('SMTP no configurado');

    transporte ??= crearTransporte();
    const t = await transporte.catch((error: unknown) => {
        transporte = undefined; // permite reintentar en el siguiente envio
        throw error;
    });

    const info = await t.sendMail({
        from: env.MAIL_FROM ?? '"Observatorio Turistico Sostenible" <no-reply@ots.local>',
        to: correo.para,
        subject: correo.asunto,
        html: correo.html,
        text: correo.texto,
    });

    const vista = nodemailer.getTestMessageUrl(info);
    if (vista) console.log(`[correo] Vista previa: ${vista}`);
}