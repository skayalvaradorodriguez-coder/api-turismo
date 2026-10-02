import readline from 'node:readline';
import { z } from 'zod';
import { pool } from '../config/db';
import { hashPassword } from '../utils/password';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
});

// Para que la contrasena no se vea mientras se escribe
let silenciar = false;
const salida = rl as unknown as { _writeToOutput: (texto: string) => void };
const escribirOriginal = salida._writeToOutput.bind(rl);
salida._writeToOutput = (texto: string): void => {
    if (!silenciar) escribirOriginal(texto);
};

function preguntar(texto: string, oculto = false): Promise<string> {
    return new Promise((resolve) => {
        rl.question(texto, (respuesta) => {
            silenciar = false;
            if (oculto) process.stdout.write('\n');
            resolve(respuesta);
        });
        silenciar = oculto;
    });
}

const datosSchema = z.object({
    nombres: z.string().trim().min(2, 'Nombres: minimo 2 caracteres').max(100),
    apellidos: z.string().trim().min(2, 'Apellidos: minimo 2 caracteres').max(100),
    email: z.string().trim().toLowerCase().pipe(z.email('Correo invalido').max(190)),
    password: z
        .string()
        .min(12, 'La contrasena debe tener al menos 12 caracteres')
        .max(128, 'La contrasena es demasiado larga')
        .regex(/[a-z]/, 'Debe incluir una minuscula')
        .regex(/[A-Z]/, 'Debe incluir una mayuscula')
        .regex(/[0-9]/, 'Debe incluir un numero'),
});

async function main(): Promise<void> {
    console.log('=== Crear usuario super_admin ===\n');

    const nombres = await preguntar('Nombres: ');
    const apellidos = await preguntar('Apellidos: ');
    const email = await preguntar('Correo: ');
    const password = await preguntar('Contrasena (no se muestra): ', true);
    const confirmacion = await preguntar('Repite la contrasena: ', true);
    rl.close();

    if (password !== confirmacion) {
        console.error('\nLas contrasenas no coinciden. No se creo nada.');
        process.exitCode = 1;
        return;
    }

    const datos = datosSchema.safeParse({ nombres, apellidos, email, password });
    if (!datos.success) {
        console.error('\nDatos invalidos:');
        for (const issue of datos.error.issues) console.error(`  - ${issue.message}`);
        process.exitCode = 1;
        return;
    }

    const passwordHash = await hashPassword(datos.data.password);

    try {
        const [resultado] = await pool.execute(
            `INSERT INTO usuarios (nombres, apellidos, email, password_hash, rol_id, email_verificado_at)
       SELECT ?, ?, ?, ?, r.id, NOW() FROM roles r WHERE r.codigo = 'super_admin'`,
            [datos.data.nombres, datos.data.apellidos, datos.data.email, passwordHash],
        );
        const filas = (resultado as { affectedRows: number }).affectedRows;
        if (filas === 0) {
            console.error("\nNo existe el rol 'super_admin'. Ejecuta primero database/001_auth.sql.");
            process.exitCode = 1;
            return;
        }
        console.log(`\nSuper admin creado: ${datos.data.email}`);
    } catch (error) {
        if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
            console.error('\nYa existe un usuario con ese correo. No se modifico nada.');
        } else {
            console.error('\nError al crear el usuario:', error instanceof Error ? error.message : error);
        }
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        void pool.end();
    });