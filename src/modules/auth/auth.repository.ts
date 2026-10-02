import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';

export interface UsuarioRow extends RowDataPacket {
    id: number;
    nombres: string;
    apellidos: string;
    email: string;
    password_hash: string | null;
    activo: number;
    email_verificado_at: Date | null;
    intentos_fallidos: number;
    bloqueado: number; // 1 si la cuenta sigue bloqueada ahora mismo
    rol_codigo: string;
}

const SELECT_USUARIO = `
  SELECT u.id, u.nombres, u.apellidos, u.email, u.password_hash, u.activo,
         u.email_verificado_at, u.intentos_fallidos,
         (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > NOW()) AS bloqueado,
         r.codigo AS rol_codigo
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id`;

export async function buscarPorEmail(email: string): Promise<UsuarioRow | null> {
    const [rows] = await pool.execute<UsuarioRow[]>(`${SELECT_USUARIO} WHERE u.email = ? LIMIT 1`, [email]);
    return rows[0] ?? null;
}

export async function buscarPorId(id: number): Promise<UsuarioRow | null> {
    const [rows] = await pool.execute<UsuarioRow[]>(`${SELECT_USUARIO} WHERE u.id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
}

// Incremento atomico (varias peticiones a la vez no se "pierden") y bloqueo al llegar al maximo
export async function registrarFallo(id: number, maxIntentos: number, minutosBloqueo: number): Promise<void> {
    await pool.execute('UPDATE usuarios SET intentos_fallidos = LEAST(intentos_fallidos + 1, 250) WHERE id = ?', [id]);
    await pool.execute(
        'UPDATE usuarios SET bloqueado_hasta = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ? AND intentos_fallidos >= ?',
        [minutosBloqueo, id, maxIntentos],
    );
}

export async function limpiarBloqueo(id: number): Promise<void> {
    await pool.execute('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [id]);
}

export async function registrarLoginExitoso(id: number): Promise<void> {
    await pool.execute(
        'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login_at = NOW() WHERE id = ?',
        [id],
    );
}