import { AppError } from '../../utils/AppError';
import * as cargasRepo from '../cargas/cargas.repository';
import * as repo from './procesamiento.repository';
import type { FiltroHallazgos, HallazgoGuardado, Procesamiento, ResumenHallazgo } from './procesamiento.repository';

// Por ahora este modulo solo CONSULTA el historial de procesamientos y sus hallazgos.
// Ejecutar la validacion y el procesamiento lo hara el servicio de procesamiento (Python),
// cuando se defina el contrato entre la API y ese servicio.

const cargaNoEncontrada = () => new AppError('La carga no existe', 404, 'CARGA_NO_ENCONTRADA');

export async function listarProcesamientosDeCarga(cargaId: number): Promise<Procesamiento[]> {
    if (!(await cargasRepo.buscarCargaPorId(cargaId))) throw cargaNoEncontrada();
    return repo.listarProcesamientos(cargaId);
}

/** Hallazgos de un procesamiento (que debe pertenecer a esa carga) junto con el resumen por regla. */
export async function obtenerHallazgos(
    cargaId: number,
    procesamientoId: number,
    filtro: FiltroHallazgos,
): Promise<{ hallazgos: HallazgoGuardado[]; total: number; resumen: ResumenHallazgo[] }> {
    const procesamiento = await repo.buscarProcesamiento(procesamientoId);
    if (!procesamiento || procesamiento.cargaId !== cargaId) {
        throw new AppError('El procesamiento no existe', 404, 'PROCESAMIENTO_NO_ENCONTRADO');
    }
    const [lista, resumen] = await Promise.all([repo.listarHallazgos(procesamientoId, filtro), repo.resumirHallazgos(procesamientoId)]);
    return { ...lista, resumen };
}
