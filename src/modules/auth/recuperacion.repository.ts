import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import type { TipoToken } from './registro.repository';

/** Comprueba que el token exista, no se haya usado y no haya expirado, SIN gastarlo. */
export async function tokenVigente(tipo: TipoToken, tokenHash: string): Promise<boolean> {
    const [filas] = await pool.execute<RowDataPacket[]>(
        `SELECT 1 FROM tokens_usuario
      WHERE token_hash = ? AND tipo = ? AND usado_at IS NULL AND expira_at > NOW() LIMIT 1`,
        [tokenHash, tipo],
    );
    return filas.length > 0;
}

/**
 * Guarda la contrasena nueva, desbloquea la cuenta y cierra todas las sesiones abiertas:
 * los tokens de sesion emitidos hasta este instante dejan de valer.
 */
export async function actualizarPassword(usuarioId: number, passwordHash: string): Promise<void> {
    await pool.execute(
        `UPDATE usuarios
        SET password_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL, sesiones_validas_desde = NOW()
      WHERE id = ?`,
        [passwordHash, usuarioId],
    );
}