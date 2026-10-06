import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';

export type TipoToken = 'verificar_email' | 'recuperar_password';

/** Crea un usuario con el rol 'usuario'. El rol super_admin NUNCA se asigna desde aqui. */
export async function crearUsuario(datos: {
    nombres: string;
    apellidos: string;
    email: string;
    passwordHash: string;
}): Promise<number> {
    const [resultado] = await pool.execute<ResultSetHeader>(
        `INSERT INTO usuarios (nombres, apellidos, email, password_hash, rol_id)
     SELECT ?, ?, ?, ?, r.id FROM roles r WHERE r.codigo = 'usuario'`,
        [datos.nombres, datos.apellidos, datos.email, datos.passwordHash],
    );
    if (resultado.affectedRows === 0) throw new Error("No existe el rol 'usuario'. Ejecuta database/001_auth.sql");
    return resultado.insertId;
}

/** Si alguien se vuelve a registrar con un correo aun sin verificar, gana el ultimo registro. */
export async function actualizarRegistroNoVerificado(
    id: number,
    nombres: string,
    apellidos: string,
    passwordHash: string,
): Promise<void> {
    await pool.execute(
        `UPDATE usuarios
        SET nombres = ?, apellidos = ?, password_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL
      WHERE id = ? AND email_verificado_at IS NULL`,
        [nombres, apellidos, passwordHash, id],
    );
}

export async function marcarEmailVerificado(id: number): Promise<void> {
    await pool.execute('UPDATE usuarios SET email_verificado_at = COALESCE(email_verificado_at, NOW()) WHERE id = ?', [id]);
}

export async function invalidarTokens(usuarioId: number, tipo: TipoToken): Promise<void> {
    await pool.execute('UPDATE tokens_usuario SET usado_at = NOW() WHERE usuario_id = ? AND tipo = ? AND usado_at IS NULL', [
        usuarioId,
        tipo,
    ]);
}

export async function crearToken(usuarioId: number, tipo: TipoToken, tokenHash: string, minutos: number): Promise<void> {
    await pool.execute(
        `INSERT INTO tokens_usuario (usuario_id, tipo, token_hash, expira_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [usuarioId, tipo, tokenHash, minutos],
    );
}

/**
 * Usa el token UNA sola vez. El UPDATE es atomico: si dos peticiones llegan a la vez
 * con el mismo enlace, solo una gana. Devuelve el id del usuario o null.
 */
export async function consumirToken(tipo: TipoToken, tokenHash: string): Promise<number | null> {
    const [resultado] = await pool.execute<ResultSetHeader>(
        `UPDATE tokens_usuario SET usado_at = NOW()
      WHERE token_hash = ? AND tipo = ? AND usado_at IS NULL AND expira_at > NOW()`,
        [tokenHash, tipo],
    );
    if (resultado.affectedRows !== 1) return null;

    const [filas] = await pool.execute<RowDataPacket[]>('SELECT usuario_id FROM tokens_usuario WHERE token_hash = ? LIMIT 1', [
        tokenHash,
    ]);
    const id: unknown = filas[0]?.['usuario_id'];
    return typeof id === 'number' ? id : null;
}

export async function hayTokenReciente(usuarioId: number, tipo: TipoToken, segundos: number): Promise<boolean> {
    const [filas] = await pool.execute<RowDataPacket[]>(
        `SELECT 1 FROM tokens_usuario
      WHERE usuario_id = ? AND tipo = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND) LIMIT 1`,
        [usuarioId, tipo, segundos],
    );
    return filas.length > 0;
}