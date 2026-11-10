import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import type { Ejecutor } from '../auditoria/auditoria.repository';

// ---------------------------------------------------------------
// Tipos que entrega la API (camelCase)
// ---------------------------------------------------------------
export type Severidad = 'error' | 'alerta';
export type TipoProcesamiento = 'validacion' | 'procesamiento';
export type EstadoProcesamiento = 'en_curso' | 'completado' | 'fallido';

export interface Procesamiento {
    id: number;
    cargaId: number;
    archivoId: number;
    tipo: TipoProcesamiento;
    estado: EstadoProcesamiento;
    totalFilas: number;
    totalErrores: number;
    totalAlertas: number;
    mensajeError: string | null;
    ejecutadoPor: number;
    iniciadoEn: Date;
    finalizadoEn: Date | null;
}

export interface DatosNuevoProcesamiento {
    cargaId: number;
    archivoId: number;
    tipo: TipoProcesamiento;
    ejecutadoPor: number;
}

export interface ResultadoFinal {
    estado: 'completado' | 'fallido';
    totalFilas: number;
    totalErrores: number;
    totalAlertas: number;
    mensajeError?: string | null;
}

export interface Hallazgo {
    fila: number | null; // numero de fila de datos (la primera despues del encabezado es la 1); null si es del archivo completo
    columna: string | null;
    regla: string;
    severidad: Severidad;
    mensaje: string;
    valorOriginal: string | null;
    valorCorregido: string | null;
}

export interface HallazgoGuardado extends Hallazgo {
    id: number;
    procesamientoId: number;
}

export interface FiltroHallazgos {
    severidad?: Severidad;
    regla?: string;
    limite: number;
    pagina: number;
}

export interface ResumenHallazgo {
    regla: string;
    severidad: Severidad;
    total: number;
}

// ---------------------------------------------------------------
// Filas tal como salen de MySQL (snake_case)
// ---------------------------------------------------------------
interface ProcesamientoRow extends RowDataPacket {
    id: number;
    carga_id: number;
    archivo_id: number;
    tipo: TipoProcesamiento;
    estado: EstadoProcesamiento;
    total_filas: number;
    total_errores: number;
    total_alertas: number;
    mensaje_error: string | null;
    ejecutado_por: number;
    iniciado_at: Date;
    finalizado_at: Date | null;
}

interface HallazgoRow extends RowDataPacket {
    id: number;
    procesamiento_id: number;
    fila: number | null;
    columna: string | null;
    regla: string;
    severidad: Severidad;
    mensaje: string;
    valor_original: string | null;
    valor_corregido: string | null;
}

const SELECT_PROCESAMIENTO = `
  SELECT id, carga_id, archivo_id, tipo, estado, total_filas, total_errores, total_alertas,
         mensaje_error, ejecutado_por, iniciado_at, finalizado_at
    FROM procesamientos`;

const SELECT_HALLAZGO = `
  SELECT id, procesamiento_id, fila, columna, regla, severidad, mensaje, valor_original, valor_corregido
    FROM hallazgos`;

function aProcesamiento(f: ProcesamientoRow): Procesamiento {
    return {
        id: f.id,
        cargaId: f.carga_id,
        archivoId: f.archivo_id,
        tipo: f.tipo,
        estado: f.estado,
        totalFilas: f.total_filas,
        totalErrores: f.total_errores,
        totalAlertas: f.total_alertas,
        mensajeError: f.mensaje_error,
        ejecutadoPor: f.ejecutado_por,
        iniciadoEn: f.iniciado_at,
        finalizadoEn: f.finalizado_at,
    };
}

function aHallazgo(f: HallazgoRow): HallazgoGuardado {
    return {
        id: f.id,
        procesamientoId: f.procesamiento_id,
        fila: f.fila,
        columna: f.columna,
        regla: f.regla,
        severidad: f.severidad,
        mensaje: f.mensaje,
        valorOriginal: f.valor_original,
        valorCorregido: f.valor_corregido,
    };
}

// Las inserciones grandes se hacen por lotes para no pasar de los limites de MySQL
const TAMANO_LOTE = 500;

function porLotes<T>(elementos: readonly T[]): T[][] {
    const lotes: T[][] = [];
    for (let i = 0; i < elementos.length; i += TAMANO_LOTE) lotes.push(elementos.slice(i, i + TAMANO_LOTE));
    return lotes;
}

// LIMIT y OFFSET se escriben en el SQL, pero solo despues de convertirlos en enteros acotados
function paginar(limite: number, pagina: number): { limite: number; desplazamiento: number } {
    const l = Number.isFinite(limite) ? Math.min(Math.max(Math.trunc(limite), 1), 200) : 50;
    const p = Number.isFinite(pagina) ? Math.max(Math.trunc(pagina), 1) : 1;
    return { limite: l, desplazamiento: (p - 1) * l };
}

// ---------------------------------------------------------------
// Procesamientos
// ---------------------------------------------------------------

/** Registra el inicio de una validacion o un procesamiento. Nace 'en_curso'. Devuelve su id. */
export async function crearProcesamiento(datos: DatosNuevoProcesamiento, ejecutor: Ejecutor = pool): Promise<number> {
    const [resultado] = await ejecutor.execute<ResultSetHeader>(
        'INSERT INTO procesamientos (carga_id, archivo_id, tipo, ejecutado_por) VALUES (?, ?, ?, ?)',
        [datos.cargaId, datos.archivoId, datos.tipo, datos.ejecutadoPor],
    );
    return resultado.insertId;
}

/** Cierra un procesamiento 'en_curso' con sus totales. Devuelve false si ya estaba cerrado o no existe. */
export async function finalizarProcesamiento(id: number, resultado: ResultadoFinal, ejecutor: Ejecutor = pool): Promise<boolean> {
    const [cambio] = await ejecutor.execute<ResultSetHeader>(
        `UPDATE procesamientos
        SET estado = ?, total_filas = ?, total_errores = ?, total_alertas = ?, mensaje_error = ?, finalizado_at = CURRENT_TIMESTAMP
      WHERE id = ? AND estado = 'en_curso'`,
        [resultado.estado, resultado.totalFilas, resultado.totalErrores, resultado.totalAlertas, resultado.mensajeError ?? null, id],
    );
    return cambio.affectedRows === 1;
}

export async function buscarProcesamiento(id: number, ejecutor: Ejecutor = pool): Promise<Procesamiento | null> {
    const [filas] = await ejecutor.execute<ProcesamientoRow[]>(`${SELECT_PROCESAMIENTO} WHERE id = ? LIMIT 1`, [id]);
    return filas[0] ? aProcesamiento(filas[0]) : null;
}

/** Procesamientos de una carga, el mas reciente primero. */
export async function listarProcesamientos(cargaId: number, ejecutor: Ejecutor = pool): Promise<Procesamiento[]> {
    const [filas] = await ejecutor.execute<ProcesamientoRow[]>(`${SELECT_PROCESAMIENTO} WHERE carga_id = ? ORDER BY id DESC`, [cargaId]);
    return filas.map(aProcesamiento);
}

/** true si la carga ya tiene un procesamiento de ese tipo terminado con exito. */
export async function existeProcesamientoCompletado(cargaId: number, tipo: TipoProcesamiento, ejecutor: Ejecutor = pool): Promise<boolean> {
    const [filas] = await ejecutor.execute<RowDataPacket[]>(
        "SELECT id FROM procesamientos WHERE carga_id = ? AND tipo = ? AND estado = 'completado' LIMIT 1",
        [cargaId, tipo],
    );
    return filas.length === 1;
}

// ---------------------------------------------------------------
// Hallazgos
// ---------------------------------------------------------------

export async function insertarHallazgos(procesamientoId: number, hallazgos: readonly Hallazgo[], ejecutor: Ejecutor = pool): Promise<void> {
    for (const lote of porLotes(hallazgos)) {
        const marcas = lote.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        await ejecutor.execute(
            `INSERT INTO hallazgos (procesamiento_id, fila, columna, regla, severidad, mensaje, valor_original, valor_corregido)
       VALUES ${marcas}`,
            lote.flatMap((h) => [procesamientoId, h.fila, h.columna, h.regla, h.severidad, h.mensaje, h.valorOriginal, h.valorCorregido]),
        );
    }
}

export async function listarHallazgos(
    procesamientoId: number,
    filtro: FiltroHallazgos,
    ejecutor: Ejecutor = pool,
): Promise<{ hallazgos: HallazgoGuardado[]; total: number }> {
    const condiciones = ['procesamiento_id = ?'];
    const parametros: Array<string | number> = [procesamientoId];
    if (filtro.severidad !== undefined) {
        condiciones.push('severidad = ?');
        parametros.push(filtro.severidad);
    }
    if (filtro.regla !== undefined) {
        condiciones.push('regla = ?');
        parametros.push(filtro.regla);
    }
    const donde = `WHERE ${condiciones.join(' AND ')}`;
    const { limite, desplazamiento } = paginar(filtro.limite, filtro.pagina);

    const [filas] = await ejecutor.execute<HallazgoRow[]>(`${SELECT_HALLAZGO} ${donde} ORDER BY id LIMIT ${limite} OFFSET ${desplazamiento}`, parametros);
    const [conteo] = await ejecutor.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM hallazgos ${donde}`, parametros);
    return { hallazgos: filas.map(aHallazgo), total: Number(conteo[0]?.['total'] ?? 0) };
}

/** Cuantos hallazgos hay de cada regla (errores primero), para mostrar un resumen. */
export async function resumirHallazgos(procesamientoId: number, ejecutor: Ejecutor = pool): Promise<ResumenHallazgo[]> {
    const [filas] = await ejecutor.execute<RowDataPacket[]>(
        `SELECT regla, severidad, COUNT(*) AS total
       FROM hallazgos WHERE procesamiento_id = ?
      GROUP BY regla, severidad
      ORDER BY (severidad = 'error') DESC, total DESC, regla ASC`,
        [procesamientoId],
    );
    return filas.map((f) => ({ regla: String(f['regla']), severidad: f['severidad'] as Severidad, total: Number(f['total']) }));
}
