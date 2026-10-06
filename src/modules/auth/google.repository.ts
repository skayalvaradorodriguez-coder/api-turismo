import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';

export interface UsuarioGoogleRow extends RowDataPacket {
    id: number;
    activo: number;
    email_verificado_at: Date | null;
    google_sub: string | null;
}

const SELECT = 'SELECT id, activo, email_verificado_at, google_sub FROM usuarios';

export async function buscarPorSub(sub: string): Promise<UsuarioGoogleRow | null> {
    const [filas] = await pool.execute<UsuarioGoogleRow[]>(`${SELECT} WHERE google_sub = ? LIMIT 1`, [sub]);
    return filas[0] ?? null;
}

export async function buscarPorEmail(email: string): Promise<UsuarioGoogleRow | null> {
    const [filas] = await pool.execute<UsuarioGoogleRow[]>(`${SELECT} WHERE email = ? LIMIT 1`, [email]);
    return filas[0] ?? null;
}

/** Cuenta nueva creada con Google: SIEMPRE rol 'usuario' y sin contrasena (password_hash NULL). */
export async function crearUsuario(datos: { nombres: string; apellidos: string; email: string; sub: string }): Promise<number> {
    const [resultado] = await pool.execute<ResultSetHeader>(
        `INSERT INTO usuarios (nombres, apellidos, email, google_sub, rol_id, email_verificado_at)
     SELECT ?, ?, ?, ?, r.id, NOW() FROM roles r WHERE r.codigo = 'usuario'`,
        [datos.nombres, datos.apellidos, datos.email, datos.sub],
    );
    if (resultado.affectedRows === 0) throw new Error("No existe el rol 'usuario'. Ejecuta database/001_auth.sql");
    return resultado.insertId;
}

/** La cuenta ya tenia el correo verificado: solo se le agrega Google. */
export async function vincularCuentaVerificada(id: number, sub: string): Promise<void> {
    await pool.execute('UPDATE usuarios SET google_sub = ? WHERE id = ? AND google_sub IS NULL', [sub, id]);
}

/**
 * La cuenta estaba pendiente de verificar (alguien se registro con ese correo y contrasena, pero nadie
 * demostro ser su dueno). Google SI lo demuestra, asi que se verifica el correo y se DESCARTA la
 * contrasena que dejo ese registro (podia haberla puesto otra persona) y se cierran sus sesiones.
 */
export async function vincularCuentaPendiente(id: number, sub: string): Promise<void> {
    await pool.execute(
        `UPDATE usuarios
        SET google_sub = ?, password_hash = NULL, email_verificado_at = NOW(),
            intentos_fallidos = 0, bloqueado_hasta = NULL, sesiones_validas_desde = NOW()
      WHERE id = ? AND google_sub IS NULL AND email_verificado_at IS NULL`,
        [sub, id],
    );
}