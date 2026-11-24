import { AppError } from '../../utils/AppError';
import * as cargasRepo from '../cargas/cargas.repository';
import * as fuentesRepo from '../fuentes/fuentes.repository';
import { calcularIndicadores } from './indicadores.catalogo';
import type { ResultadoIndicador } from './indicadores.catalogo';
import * as repo from './indicadores.repository';

export interface IndicadoresDeCarga {
    carga: {
        id: number;
        fuente: { id: number; nombre: string; institucion: string };
        periodoDesde: string | null;
        periodoHasta: string | null;
        estado: string;
    };
    estructura: string;
    procesamientoId: number;
    totalRegistros: number;
    indicadores: Array<ResultadoIndicador & { nombre: string; descripcion: string; advertencia?: string }>;
}

export async function indicadoresDeCarga(cargaId: number): Promise<IndicadoresDeCarga> {
    const carga = await cargasRepo.buscarCargaPorId(cargaId);
    if (!carga) throw new AppError('La carga no existe', 404, 'CARGA_NO_ENCONTRADA');
    const fuente = await fuentesRepo.buscarPorId(carga.fuenteId);
    if (!fuente) throw new AppError('La fuente de la carga no existe', 404, 'FUENTE_NO_ENCONTRADA');

    const procesados = await repo.registrosDelUltimoProcesamiento(cargaId);
    if (!procesados) {
        throw new AppError('La carga todavía no fue procesada: no hay datos para calcular indicadores', 409, 'CARGA_SIN_PROCESAR');
    }
    return {
        carga: {
            id: carga.id,
            fuente: { id: fuente.id, nombre: fuente.nombre, institucion: fuente.institucion },
            periodoDesde: carga.periodoDesde,
            periodoHasta: carga.periodoHasta,
            estado: carga.estado,
        },
        estructura: procesados.estructura,
        procesamientoId: procesados.procesamientoId,
        totalRegistros: procesados.registros.length,
        indicadores: calcularIndicadores(procesados.estructura, procesados.registros),
    };
}
