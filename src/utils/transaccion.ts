import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../config/db';

/**
 * Ejecuta varias operaciones como una sola: si alguna falla, no se guarda ninguna.
 * El trabajo recibe la conexion para pasarla a los repositorios.
 */
export async function enTransaccion<T>(trabajo: (conexion: PoolConnection) => Promise<T>): Promise<T> {
    const conexion = await pool.getConnection();
    try {
        await conexion.beginTransaction();
        const resultado = await trabajo(conexion);
        await conexion.commit();
        return resultado;
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }
}