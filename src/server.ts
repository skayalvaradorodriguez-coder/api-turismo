import { app } from './app';
import { env } from './config/env';
import { pool, checkDb } from './config/db';

async function main(): Promise<void> {
    try {
        await checkDb();
        console.log(`MySQL conectado (${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME})`);
    } catch (error) {
        console.error('No se pudo conectar a MySQL. Revisa que XAMPP este iniciado y los datos DB_* del .env.');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }

    const server = app.listen(env.PORT, () => {
        console.log(`API Web Turismo en http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
    });

    const shutdown = (signal: string): void => {
        console.log(`${signal} recibido, cerrando servidor...`);
        server.close(() => {
            void pool.end().finally(() => process.exit(0));
        });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main();