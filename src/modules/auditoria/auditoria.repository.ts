import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../../config/db';

export interface EventoBitacora {
    usuarioId?: number | null;
    accion: string; // por ejemplo 'carga.crear'
    entidad: string; // por ejemplo 'carga'
    entidadId?: number | null;
    detalle?: Record<string, unknown> | null;
    ip?: string | null;
}

// Acepta el pool o una conexion con transaccion abierta
export type Ejecutor = Pick<PoolConnection, 'execute'>;

export async function insertar(
    evento: EventoBitacora,
    detalleJson: string | null,
    ejecutor: Ejecutor = pool,
): Promise<void> {
    await ejecutor.execute(
        `INSERT INTO bitacora (usuario_id, accion, entidad, entidad_id, detalle, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
        [evento.usuarioId ?? null, evento.accion, evento.entidad, evento.entidadId ?? null, detalleJson, evento.ip ?? null],
    );
}