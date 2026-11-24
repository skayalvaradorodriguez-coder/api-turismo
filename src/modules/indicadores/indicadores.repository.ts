import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import type { Ejecutor } from '../auditoria/auditoria.repository';
import type { RegistroDatos } from './indicadores.catalogo';

export interface RegistrosProcesados {
    procesamientoId: number;
    estructura: string;
    registros: RegistroDatos[];
}

// MariaDB guarda el JSON como texto y MySQL lo entrega ya convertido: se aceptan los dos casos
function aObjeto(valor: unknown): RegistroDatos {
    const objeto: unknown = typeof valor === 'string' ? JSON.parse(valor) : valor;
    return objeto !== null && typeof objeto === 'object' && !Array.isArray(objeto) ? (objeto as RegistroDatos) : {};
}

/**
 * Registros que salieron del procesamiento mas reciente de la carga terminado con exito.
 * Devuelve null si la carga todavia no fue procesada.
 */
export async function registrosDelUltimoProcesamiento(cargaId: number, ejecutor: Ejecutor = pool): Promise<RegistrosProcesados | null> {
    const [proc] = await ejecutor.execute<RowDataPacket[]>(
        "SELECT id FROM procesamientos WHERE carga_id = ? AND tipo = 'procesamiento' AND estado = 'completado' ORDER BY id DESC LIMIT 1",
        [cargaId],
    );
    const procesamientoId = proc[0]?.['id'];
    if (typeof procesamientoId !== 'number') return null;

    const [filas] = await ejecutor.execute<RowDataPacket[]>(
        'SELECT estructura, datos FROM registros_procesados WHERE procesamiento_id = ? ORDER BY fila_origen',
        [procesamientoId],
    );
    const estructura = filas[0]?.['estructura'];
    return {
        procesamientoId,
        estructura: typeof estructura === 'string' ? estructura : '',
        registros: filas.map((f) => aObjeto(f['datos'])),
    };
}

/** Tipo de datos (estructura) de la carga segun su ultimo procesamiento terminado, sin leer todos los registros. */
export async function estructuraDelUltimoProcesamiento(cargaId: number, ejecutor: Ejecutor = pool): Promise<string | null> {
    const [filas] = await ejecutor.execute<RowDataPacket[]>(
        `SELECT estructura FROM registros_procesados
          WHERE procesamiento_id = (
            SELECT id FROM procesamientos
             WHERE carga_id = ? AND tipo = 'procesamiento' AND estado = 'completado'
             ORDER BY id DESC LIMIT 1)
          LIMIT 1`,
        [cargaId],
    );
    const estructura = filas[0]?.['estructura'];
    return typeof estructura === 'string' ? estructura : null;
}
