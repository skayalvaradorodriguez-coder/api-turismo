import { app } from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
    console.log(`API Web Turismo en http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
    console.log(`${signal} recibido, cerrando servidor...`);
    server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));