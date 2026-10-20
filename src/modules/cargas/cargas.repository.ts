import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import type { Ejecutor } from '../auditoria/auditoria.repository';
import type { EstadoCarga } from './cargas.schemas';

// ---------------------------------------------------------------
// Tipos que entrega la API (camelCase)
// ---------------------------------------------------------------
export interface Carga {
    id: number;
    fuenteId: number;
    estructuraId: number | null;
    descripcion: string | null;
    periodoDesde: string | null; // AAAA-MM-DD
    periodoHasta: string | null; // AAAA-MM-DD
    nivelIngreso: number;
    estado: EstadoCarga;
    motivoRechazo: string | null;
    cargadoPor: number;
    publicadaPor: number | null;
    publicadaEn: Date | null;
    creadaEn: Date;
    actualizadaEn: Date;
}

export interface ArchivoOriginal {
    id: number;
    cargaId: number;
    nombreOriginal: string;
    nombreAlmacenado: string;
    tipoMime: string;
    tamanoBytes: number;
    sha256: string;
    version: number;
    vigente: boolean;
    subidoPor: number;
    creadoEn: Date;
}

export interface Metadato {
    clave: string;
    valor: string;
}

export interface DatosNuevaCarga {
    fuenteId: number;
    estructuraId?: number | null;
    descripcion?: string | null;
    periodoDesde?: string | null;
    periodoHasta?: string | null;
    nivelIngreso?: number;
    cargadoPor: number;
}

export interface DatosNuevoArchivo {
    cargaId: number;
    nombreOriginal: string;
    nombreAlmacenado: string;
    tipoMime: string;
    tamanoBytes: number;
    sha256: string;
    subidoPor: number;
}

export interface FiltroCargas {
    fuenteId?: number;
    estado?: EstadoCarga;
    limite: number;
    pagina: number;
}

// ---------------------------------------------------------------
// Filas tal como salen de MySQL (snake_case)
// ---------------------------------------------------------------
interface CargaRow extends RowDataPacket {
    id: number;
    fuente_id: number;
    estructura_id: number | null;
    descripcion: string | null;
    periodo_desde: string | null;
    periodo_hasta: string | null;
    nivel_ingreso: number;
    estado: EstadoCarga;
    motivo_rechazo: string | null;
    cargado_por: number;
    publicada_por: number | null;
    publicada_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

interface ArchivoRow extends RowDataPacket {
    id: number;
    carga_id: number;
    nombre_original: string;
    nombre_almacenado: string;
    tipo_mime: string;
    tamano_bytes: number;
    sha256: string;
    version: number;
    vigente: number;
    subido_por: number;
    created_at: Date;
}

// Las fechas del periodo se piden ya como texto AAAA-MM-DD (sin husos horarios de por medio)
const SELECT_CARGA = `
  SELECT id, fuente_id, estructura_id, descripcion,
         DATE_FORMAT(periodo_desde, '%Y-%m-%d') AS periodo_desde,
         DATE_FORMAT(periodo_hasta, '%Y-%m-%d') AS periodo_hasta,
         nivel_ingreso, estado, motivo_rechazo, cargado_por, publicada_por, publicada_at,
         created_at, updated_at
    FROM cargas`;

const SELECT_ARCHIVO = `
  SELECT id, carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256,
         version, vigente, subido_por, created_at
    FROM archivos_originales`;

function aCarga(f: CargaRow): Carga {
    return {
        id: f.id,
        fuenteId: f.fuente_id,
        estructuraId: f.estructura_id,
        descripcion: f.descripcion,
        periodoDesde: f.periodo_desde,
        periodoHasta: f.periodo_hasta,
        nivelIngreso: f.nivel_ingreso,
        estado: f.estado,
        motivoRechazo: f.motivo_rechazo,
        cargadoPor: f.cargado_por,
        publicadaPor: f.publicada_por,
        publicadaEn: f.publicada_at,
        creadaEn: f.created_at,
        actualizadaEn: f.updated_at,
    };
}

function aArchivo(f: ArchivoRow): ArchivoOriginal {
    return {
        id: f.id,
        cargaId: f.carga_id,
        nombreOriginal: f.nombre_original,
        nombreAlmacenado: f.nombre_almacenado,
        tipoMime: f.tipo_mime,
        tamanoBytes: Number(f.tamano_bytes),
        sha256: f.sha256,
        version: f.version,
        vigente: f.vigente === 1,
        subidoPor: f.subido_por,
        creadoEn: f.created_at,
    };
}

/** true si el error de MySQL es "valor repetido" de esa restriccion unica (por ejemplo 'uq_archivos_carga_sha'). */
export function esDuplicadoDe(error: unknown, restriccion: string): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const { code, message } = error as { code?: unknown; message?: unknown };
    return code === 'ER_DUP_ENTRY' && typeof message === 'string' && message.includes(restriccion);
}

// ---------------------------------------------------------------
// Cargas
// ---------------------------------------------------------------

/** Devuelve el id de la carga creada. El estado inicial siempre es 'recibida'. */
export async function crearCarga(datos: DatosNuevaCarga, ejecutor: Ejecutor = pool): Promise<number> {
    const [resultado] = await ejecutor.execute<ResultSetHeader>(
        `INSERT INTO cargas (fuente_id, estructura_id, descripcion, periodo_desde, periodo_hasta, nivel_ingreso, cargado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            datos.fuenteId,
            datos.estructuraId ?? null,
            datos.descripcion ?? null,
            datos.periodoDesde ?? null,
            datos.periodoHasta ?? null,
            datos.nivelIngreso ?? 1,
            datos.cargadoPor,
        ],
    );
    return resultado.insertId;
}

export async function buscarCargaPorId(id: number, ejecutor: Ejecutor = pool): Promise<Carga | null> {
    const [filas] = await ejecutor.execute<CargaRow[]>(`${SELECT_CARGA} WHERE id = ? LIMIT 1`, [id]);
    return filas[0] ? aCarga(filas[0]) : null;
}

export async function listarCargas(
    filtro: FiltroCargas,
    ejecutor: Ejecutor = pool,
): Promise<{ cargas: Carga[]; total: number }> {
    const condiciones: string[] = [];
    const parametros: Array<string | number> = [];
    if (filtro.fuenteId !== undefined) {
        condiciones.push('fuente_id = ?');
        parametros.push(filtro.fuenteId);
    }
    if (filtro.estado !== undefined) {
        condiciones.push('estado = ?');
        parametros.push(filtro.estado);
    }
    const donde = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    // LIMIT y OFFSET se escriben en el SQL, pero solo despues de convertirlos en enteros acotados
    const limite = Number.isFinite(filtro.limite) ? Math.min(Math.max(Math.trunc(filtro.limite), 1), 200) : 50;
    const pagina = Number.isFinite(filtro.pagina) ? Math.max(Math.trunc(filtro.pagina), 1) : 1;
    const desplazamiento = (pagina - 1) * limite;

    const [filas] = await ejecutor.execute<CargaRow[]>(
        `${SELECT_CARGA} ${donde} ORDER BY id DESC LIMIT ${limite} OFFSET ${desplazamiento}`,
        parametros,
    );
    const [conteo] = await ejecutor.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM cargas ${donde}`, parametros);
    return { cargas: filas.map(aCarga), total: Number(conteo[0]?.['total'] ?? 0) };
}

/**
 * Cambia el estado SOLO si la carga esta en alguno de los estados de origen (comprobar y cambiar en una
 * sola sentencia: si dos personas actuan a la vez, solo una gana). Devuelve true si hubo cambio.
 * Si se indica nivelIngreso, el nivel sube a ese valor en la misma sentencia (nunca baja).
 */
export async function transicionarEstado(
    id: number,
    desde: EstadoCarga[],
    hacia: EstadoCarga,
    motivoRechazo: string | null,
    ejecutor: Ejecutor = pool,
    nivelIngreso?: number,
): Promise<boolean> {
    if (desde.length === 0) return false;
    const marcas = desde.map(() => '?').join(', ');
    const subeNivel = nivelIngreso === undefined ? '' : ', nivel_ingreso = GREATEST(nivel_ingreso, ?)';
    const [resultado] = await ejecutor.execute<ResultSetHeader>(
        `UPDATE cargas SET estado = ?, motivo_rechazo = ?${subeNivel} WHERE id = ? AND estado IN (${marcas})`,
        [hacia, motivoRechazo, ...(nivelIngreso === undefined ? [] : [nivelIngreso]), id, ...desde],
    );
    return resultado.affectedRows === 1;
}

/** true si la estructura existe y pertenece a esa fuente. */
export async function estructuraPerteneceAFuente(
    estructuraId: number,
    fuenteId: number,
    ejecutor: Ejecutor = pool,
): Promise<boolean> {
    const [filas] = await ejecutor.execute<RowDataPacket[]>(
        'SELECT id FROM estructuras WHERE id = ? AND fuente_id = ? LIMIT 1',
        [estructuraId, fuenteId],
    );
    return filas.length === 1;
}

// ---------------------------------------------------------------
// Archivos originales
// ---------------------------------------------------------------

/**
 * Registra un archivo. Si ya habia uno VIGENTE con el mismo nombre en esa carga, pasa a no vigente y el
 * nuevo recibe la version siguiente. Debe ejecutarse dentro de una transaccion (son dos sentencias).
 * Lanza ER_DUP_ENTRY ('uq_archivos_carga_sha') si el mismo contenido ya esta en la carga.
 */
export async function insertarArchivo(datos: DatosNuevoArchivo, ejecutor: Ejecutor = pool): Promise<number> {
    await ejecutor.execute(
        'UPDATE archivos_originales SET vigente = 0 WHERE carga_id = ? AND nombre_original = ? AND vigente = 1',
        [datos.cargaId, datos.nombreOriginal],
    );
    const [resultado] = await ejecutor.execute<ResultSetHeader>(
        `INSERT INTO archivos_originales
       (carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256, version, vigente, subido_por)
     SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(version), 0) + 1, 1, ?
       FROM archivos_originales WHERE carga_id = ? AND nombre_original = ?`,
        [
            datos.cargaId,
            datos.nombreOriginal,
            datos.nombreAlmacenado,
            datos.tipoMime,
            datos.tamanoBytes,
            datos.sha256,
            datos.subidoPor,
            datos.cargaId,
            datos.nombreOriginal,
        ],
    );
    return resultado.insertId;
}

export async function listarArchivos(cargaId: number, ejecutor: Ejecutor = pool): Promise<ArchivoOriginal[]> {
    const [filas] = await ejecutor.execute<ArchivoRow[]>(
        `${SELECT_ARCHIVO} WHERE carga_id = ? ORDER BY nombre_original, version DESC`,
        [cargaId],
    );
    return filas.map(aArchivo);
}

/** Busca un archivo dentro de una carga (un id de archivo de OTRA carga no se encuentra). */
export async function buscarArchivo(
    id: number,
    cargaId: number,
    ejecutor: Ejecutor = pool,
): Promise<ArchivoOriginal | null> {
    const [filas] = await ejecutor.execute<ArchivoRow[]>(`${SELECT_ARCHIVO} WHERE id = ? AND carga_id = ? LIMIT 1`, [
        id,
        cargaId,
    ]);
    return filas[0] ? aArchivo(filas[0]) : null;
}

// ---------------------------------------------------------------
// Metadatos
// ---------------------------------------------------------------

/** Agrega o cambia metadatos (no hay forma de borrarlos: la base no lo permite). */
export async function guardarMetadatos(
    cargaId: number,
    metadatos: Record<string, string>,
    ejecutor: Ejecutor = pool,
): Promise<void> {
    const pares = Object.entries(metadatos);
    if (pares.length === 0) return;
    const marcas = pares.map(() => '(?, ?, ?)').join(', ');
    await ejecutor.execute(
        `INSERT INTO carga_metadatos (carga_id, clave, valor) VALUES ${marcas}
     ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        pares.flatMap(([clave, valor]) => [cargaId, clave, valor]),
    );
}

export async function listarMetadatos(cargaId: number, ejecutor: Ejecutor = pool): Promise<Metadato[]> {
    const [filas] = await ejecutor.execute<RowDataPacket[]>(
        'SELECT clave, valor FROM carga_metadatos WHERE carga_id = ? ORDER BY clave',
        [cargaId],
    );
    return filas.map((f) => ({ clave: String(f['clave']), valor: String(f['valor']) }));
}