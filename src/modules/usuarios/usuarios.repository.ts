import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import type { Ejecutor } from '../auditoria/auditoria.repository';

// ---------------------------------------------------------------
// Tipos que entrega la API (camelCase). Nunca incluyen la contrasena, el hash ni datos de Google.
// ---------------------------------------------------------------
export interface UsuarioGestion {
    id: number;
    nombres: string;
    apellidos: string;
    email: string;
    rol: string;
    activo: boolean;
    emailVerificado: boolean;
    ultimoLoginEn: Date | null;
    creadoEn: Date;
}

/** Lo que se lee al bloquear una cuenta para cambiarla. */
export interface UsuarioBloqueado {
    id: number;
    rolId: number;
    rol: string;
    activo: boolean;
}

export interface Rol {
    id: number;
    codigo: string;
}

export interface FiltroUsuarios {
    rol?: string;
    activo?: boolean;
    texto?: string;
    limite: number;
    pagina: number;
}

const SELECT_USUARIO = `
    SELECT u.id, u.nombres, u.apellidos, u.email, r.codigo AS rol, u.activo,
           (u.email_verificado_at IS NOT NULL) AS email_verificado,
           u.ultimo_login_at, u.created_at
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id`;

function aUsuario(fila: RowDataPacket): UsuarioGestion {
    return {
        id: Number(fila['id']),
        nombres: String(fila['nombres']),
        apellidos: String(fila['apellidos']),
        email: String(fila['email']),
        rol: String(fila['rol']),
        activo: Number(fila['activo']) === 1,
        emailVerificado: Number(fila['email_verificado']) === 1,
        ultimoLoginEn: fila['ultimo_login_at'] instanceof Date ? fila['ultimo_login_at'] : null,
        creadoEn: fila['created_at'] as Date,
    };
}

// ---------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------
export async function buscarUsuario(id: number, ejecutor: Ejecutor = pool): Promise<UsuarioGestion | null> {
    const [filas] = await ejecutor.execute<RowDataPacket[]>(`${SELECT_USUARIO} WHERE u.id = ?`, [id]);
    return filas[0] ? aUsuario(filas[0]) : null;
}

export async function listarUsuarios(
    filtro: FiltroUsuarios,
    ejecutor: Ejecutor = pool,
): Promise<{ usuarios: UsuarioGestion[]; total: number }> {
    const condiciones: string[] = [];
    const parametros: Array<string | number> = [];

    if (filtro.rol !== undefined) {
        condiciones.push('r.codigo = ?');
        parametros.push(filtro.rol);
    }
    if (filtro.activo !== undefined) {
        condiciones.push('u.activo = ?');
        parametros.push(filtro.activo ? 1 : 0);
    }
    if (filtro.texto) {
        // % y _ del texto buscado se tratan como letras comunes, no como comodines
        const patron = `%${filtro.texto.replace(/[\\%_]/g, '\\$&')}%`;
        condiciones.push('(u.nombres LIKE ? OR u.apellidos LIKE ? OR u.email LIKE ?)');
        parametros.push(patron, patron, patron);
    }
    const donde = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    // limite y pagina ya son enteros validados; aqui se vuelven a acotar antes de escribirlos en la consulta
    const limite = Math.min(200, Math.max(1, Math.trunc(filtro.limite)));
    const desplazamiento = (Math.max(1, Math.trunc(filtro.pagina)) - 1) * limite;

    const [filas] = await ejecutor.execute<RowDataPacket[]>(
        `${SELECT_USUARIO} ${donde} ORDER BY u.created_at DESC, u.id DESC LIMIT ${limite} OFFSET ${desplazamiento}`,
        parametros,
    );
    const [conteo] = await ejecutor.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM usuarios u JOIN roles r ON r.id = u.rol_id ${donde}`,
        parametros,
    );
    return { usuarios: filas.map(aUsuario), total: Number(conteo[0]?.['total'] ?? 0) };
}

export async function buscarRolPorCodigo(codigo: string, ejecutor: Ejecutor = pool): Promise<Rol | null> {
    const [filas] = await ejecutor.execute<RowDataPacket[]>('SELECT id, codigo FROM roles WHERE codigo = ?', [codigo]);
    return filas[0] ? { id: Number(filas[0]['id']), codigo: String(filas[0]['codigo']) } : null;
}

// ---------------------------------------------------------------
// Escritura. Solo se pueden cambiar el rol y el estado (el permiso de la base lo impide para el resto).
// ---------------------------------------------------------------

/**
 * Lee la cuenta y la bloquea hasta que termine la transaccion, para que dos cambios a la vez no se pisen.
 * Solo se bloquea la fila de la cuenta; el nombre del rol se lee en una subconsulta sin bloqueo.
 */
export async function bloquearUsuario(id: number, ejecutor: Ejecutor): Promise<UsuarioBloqueado | null> {
    const [filas] = await ejecutor.execute<RowDataPacket[]>(
        `SELECT u.id, u.rol_id, u.activo,
                (SELECT r.codigo FROM roles r WHERE r.id = u.rol_id) AS rol
           FROM usuarios u
          WHERE u.id = ?
            FOR UPDATE`,
        [id],
    );
    const fila = filas[0];
    if (!fila) return null;
    return { id: Number(fila['id']), rolId: Number(fila['rol_id']), rol: String(fila['rol']), activo: Number(fila['activo']) === 1 };
}

export async function cambiarRol(id: number, rolId: number, ejecutor: Ejecutor = pool): Promise<boolean> {
    const [resultado] = await ejecutor.execute<ResultSetHeader>('UPDATE usuarios SET rol_id = ? WHERE id = ?', [rolId, id]);
    return resultado.affectedRows === 1;
}

export async function cambiarActivo(id: number, activo: boolean, ejecutor: Ejecutor = pool): Promise<boolean> {
    const [resultado] = await ejecutor.execute<ResultSetHeader>('UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
    return resultado.affectedRows === 1;
}

/** Las sesiones iniciadas antes de este momento dejan de valer (tampoco revivirian al reactivar la cuenta). */
export async function invalidarSesiones(id: number, ejecutor: Ejecutor = pool): Promise<void> {
    await ejecutor.execute('UPDATE usuarios SET sesiones_validas_desde = NOW() WHERE id = ?', [id]);
}
