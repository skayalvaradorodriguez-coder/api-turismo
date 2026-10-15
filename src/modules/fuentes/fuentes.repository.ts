import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import type { Ejecutor } from '../auditoria/auditoria.repository';

export type EstadoFuente = 'activa' | 'inactiva';

/** Lo que la API entrega (camelCase). */
export interface Fuente {
    id: number;
    codigo: string;
    nombre: string;
    institucion: string;
    descripcion: string | null;
    tipoFuente: string | null;
    mecanismoAcceso: string | null;
    frecuenciaActualizacion: string | null;
    procedencia: string | null;
    licenciaUso: string | null;
    responsable: string | null;
    estado: EstadoFuente;
    creadoPor: number;
    creadaEn: Date;
    actualizadaEn: Date;
}

/** Campos que se pueden editar (el codigo no cambia). */
export interface DatosFuente {
    nombre: string;
    institucion: string;
    descripcion?: string | null;
    tipoFuente?: string | null;
    mecanismoAcceso?: string | null;
    frecuenciaActualizacion?: string | null;
    procedencia?: string | null;
    licenciaUso?: string | null;
    responsable?: string | null;
}

export interface DatosNuevaFuente extends DatosFuente {
    codigo: string;
    creadoPor: number;
}

interface FuenteRow extends RowDataPacket {
    id: number;
    codigo: string;
    nombre: string;
    institucion: string;
    descripcion: string | null;
    tipo_fuente: string | null;
    mecanismo_acceso: string | null;
    frecuencia_actualizacion: string | null;
    procedencia: string | null;
    licencia_uso: string | null;
    responsable: string | null;
    estado: EstadoFuente;
    creado_por: number;
    created_at: Date;
    updated_at: Date;
}

const SELECT = `
  SELECT id, codigo, nombre, institucion, descripcion, tipo_fuente, mecanismo_acceso,
         frecuencia_actualizacion, procedencia, licencia_uso, responsable, estado,
         creado_por, created_at, updated_at
    FROM fuentes`;

function aFuente(f: FuenteRow): Fuente {
    return {
        id: f.id,
        codigo: f.codigo,
        nombre: f.nombre,
        institucion: f.institucion,
        descripcion: f.descripcion,
        tipoFuente: f.tipo_fuente,
        mecanismoAcceso: f.mecanismo_acceso,
        frecuenciaActualizacion: f.frecuencia_actualizacion,
        procedencia: f.procedencia,
        licenciaUso: f.licencia_uso,
        responsable: f.responsable,
        estado: f.estado,
        creadoPor: f.creado_por,
        creadaEn: f.created_at,
        actualizadaEn: f.updated_at,
    };
}

/** true si el error de MySQL es "valor repetido" (por ejemplo, un codigo de fuente que ya existe). */
export function esErrorDuplicado(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ER_DUP_ENTRY';
}

export async function listar(estado?: EstadoFuente, ejecutor: Ejecutor = pool): Promise<Fuente[]> {
    const [filas] = estado
        ? await ejecutor.execute<FuenteRow[]>(`${SELECT} WHERE estado = ? ORDER BY nombre`, [estado])
        : await ejecutor.execute<FuenteRow[]>(`${SELECT} ORDER BY nombre`);
    return filas.map(aFuente);
}

export async function buscarPorId(id: number, ejecutor: Ejecutor = pool): Promise<Fuente | null> {
    const [filas] = await ejecutor.execute<FuenteRow[]>(`${SELECT} WHERE id = ? LIMIT 1`, [id]);
    return filas[0] ? aFuente(filas[0]) : null;
}

export async function buscarPorCodigo(codigo: string, ejecutor: Ejecutor = pool): Promise<Fuente | null> {
    const [filas] = await ejecutor.execute<FuenteRow[]>(`${SELECT} WHERE codigo = ? LIMIT 1`, [codigo]);
    return filas[0] ? aFuente(filas[0]) : null;
}

/** Devuelve el id de la fuente creada. Lanza un error ER_DUP_ENTRY si el codigo ya existe. */
export async function crear(datos: DatosNuevaFuente, ejecutor: Ejecutor = pool): Promise<number> {
    const [resultado] = await ejecutor.execute<ResultSetHeader>(
        `INSERT INTO fuentes (codigo, nombre, institucion, descripcion, tipo_fuente, mecanismo_acceso,
                          frecuencia_actualizacion, procedencia, licencia_uso, responsable, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            datos.codigo,
            datos.nombre,
            datos.institucion,
            datos.descripcion ?? null,
            datos.tipoFuente ?? null,
            datos.mecanismoAcceso ?? null,
            datos.frecuenciaActualizacion ?? null,
            datos.procedencia ?? null,
            datos.licenciaUso ?? null,
            datos.responsable ?? null,
            datos.creadoPor,
        ],
    );
    return resultado.insertId;
}

export async function actualizar(id: number, datos: DatosFuente, ejecutor: Ejecutor = pool): Promise<void> {
    await ejecutor.execute(
        `UPDATE fuentes
        SET nombre = ?, institucion = ?, descripcion = ?, tipo_fuente = ?, mecanismo_acceso = ?,
            frecuencia_actualizacion = ?, procedencia = ?, licencia_uso = ?, responsable = ?
      WHERE id = ?`,
        [
            datos.nombre,
            datos.institucion,
            datos.descripcion ?? null,
            datos.tipoFuente ?? null,
            datos.mecanismoAcceso ?? null,
            datos.frecuenciaActualizacion ?? null,
            datos.procedencia ?? null,
            datos.licenciaUso ?? null,
            datos.responsable ?? null,
            id,
        ],
    );
}

export async function cambiarEstado(id: number, estado: EstadoFuente, ejecutor: Ejecutor = pool): Promise<void> {
    await ejecutor.execute('UPDATE fuentes SET estado = ? WHERE id = ?', [estado, id]);
}