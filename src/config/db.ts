import mysql from 'mysql2/promise';
import { env } from './env';

export const pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
});

// Todas las fechas se manejan en UTC dentro de la base de datos
pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+00:00'");
});

export async function checkDb(): Promise<void> {
    await pool.query('SELECT 1');
}