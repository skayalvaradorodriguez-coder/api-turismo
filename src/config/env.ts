import 'dotenv/config';
import { z } from 'zod';

// En el .env las variables opcionales pueden quedar vacias (SMTP_HOST=): se tratan como "no definidas"
const vacioAUndefined = (valor: unknown): unknown =>
    typeof valor === 'string' && valor.trim() === '' ? undefined : valor;

const schema = z
    .object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        PORT: z.coerce.number().int().min(1).max(65535).default(3000),
        FRONTEND_URL: z.url(),

        DB_HOST: z.string().min(1).default('127.0.0.1'),
        DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
        DB_NAME: z.string().min(1),
        DB_USER: z.string().min(1),
        DB_PASSWORD: z.string().min(1),

        JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
        SESSION_MINUTES: z.coerce.number().int().min(5).max(1440).default(45),
        COOKIE_SECURE: z
            .enum(['true', 'false'])
            .default('false')
            .transform((valor) => valor === 'true'),


        // Archivos originales: carpeta fuera de src/ (no se sube a git) y tamano maximo por archivo en MB
        STORAGE_DIR: z.string().min(1).default('storage'),
        MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(500).default(100),

        // Servicio de procesamiento (Python). Sin clave, validar y procesar responden "no configurado"
        PROCESAMIENTO_URL: z.preprocess(vacioAUndefined, z.url().default('http://127.0.0.1:8001')),
        PROCESAMIENTO_CLAVE: z.preprocess(vacioAUndefined, z.string().min(32, 'debe tener al menos 32 caracteres').optional()),
        PROCESAMIENTO_TIMEOUT_SEG: z.preprocess(vacioAUndefined, z.coerce.number().int().min(5).max(600).default(120)),

        // Acceso con Google: ID de cliente de Google Cloud Console (no es secreto). Vacio = el boton queda desactivado
        GOOGLE_CLIENT_ID: z.preprocess(
            vacioAUndefined,
            z
                .string()
                .regex(/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/, 'debe terminar en .apps.googleusercontent.com')
                .optional(),
        ),

        // Correo: si no hay SMTP_HOST, en desarrollo se usa Ethereal (correo de pruebas)
        SMTP_HOST: z.preprocess(vacioAUndefined, z.string().min(1).optional()),
        SMTP_PORT: z.preprocess(vacioAUndefined, z.coerce.number().int().min(1).max(65535).optional()),
        SMTP_USER: z.preprocess(vacioAUndefined, z.string().optional()),
        SMTP_PASS: z.preprocess(vacioAUndefined, z.string().optional()),
        MAIL_FROM: z.preprocess(vacioAUndefined, z.string().optional()),
    })
    .superRefine((datos, ctx) => {
        if (datos.NODE_ENV === 'production' && !datos.SMTP_HOST) {
            ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'es obligatorio en produccion' });
        }
    });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error('Variables de entorno invalidas en .env:');
    for (const issue of parsed.error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';