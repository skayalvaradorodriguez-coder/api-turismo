import { AppError } from '../../utils/AppError';
import * as cargasRepo from '../cargas/cargas.repository';
import * as fuentesRepo from '../fuentes/fuentes.repository';
import { indicadoresDeCarga } from '../indicadores/indicadores.service';
import type { IndicadoresDeCarga } from '../indicadores/indicadores.service';
import * as indicadoresRepo from '../indicadores/indicadores.repository';

// Todo lo que sale de este modulo es publico: solo cargas en estado 'publicada' y solo campos pensados
// para el publico. No salen ids de usuarios, responsables, descripciones internas ni archivos.

export interface CargaPublica {
    id: number;
    /** Tipo de datos (estructura), por ejemplo "ots_turista_v1". null si no se pudo determinar. */
    tipoDatos: string | null;
    fuente: { nombre: string; institucion: string; procedencia: string | null; licenciaUso: string | null };
    periodoDesde: string | null;
    periodoHasta: string | null;
    publicadaEn: string | null;
}

export type IndicadoresPublicados = Pick<IndicadoresDeCarga, 'estructura' | 'totalRegistros' | 'indicadores'> & {
    carga: Pick<CargaPublica, 'id' | 'periodoDesde' | 'periodoHasta' | 'publicadaEn'> & {
        fuente: { nombre: string; institucion: string };
    };
};

const noEncontrada = () => new AppError('La carga no existe o no esta publicada', 404, 'CARGA_NO_ENCONTRADA');

export async function listarCargasPublicadas(): Promise<CargaPublica[]> {
    const { cargas } = await cargasRepo.listarCargas({ estado: 'publicada', limite: 200, pagina: 1 });
    const fuentes = new Map<number, Awaited<ReturnType<typeof fuentesRepo.buscarPorId>>>();

    const lista: CargaPublica[] = [];
    for (const carga of cargas) {
        if (!fuentes.has(carga.fuenteId)) fuentes.set(carga.fuenteId, await fuentesRepo.buscarPorId(carga.fuenteId));
        const fuente = fuentes.get(carga.fuenteId);
        if (!fuente) continue; // no deberia pasar (clave foranea); mejor omitir que mostrar una fuente inventada
        lista.push({
            id: carga.id,
            tipoDatos: await indicadoresRepo.estructuraDelUltimoProcesamiento(carga.id),
            fuente: {
                nombre: fuente.nombre,
                institucion: fuente.institucion,
                procedencia: fuente.procedencia,
                licenciaUso: fuente.licenciaUso,
            },
            periodoDesde: carga.periodoDesde,
            periodoHasta: carga.periodoHasta,
            publicadaEn: carga.publicadaEn ? carga.publicadaEn.toISOString() : null,
        });
    }
    return lista;
}

export async function indicadoresPublicados(cargaId: number): Promise<IndicadoresPublicados> {
    // Se comprueba ANTES de calcular: una carga sin publicar responde igual que una que no existe
    const carga = await cargasRepo.buscarCargaPorId(cargaId);
    if (!carga || carga.estado !== 'publicada') throw noEncontrada();

    const datos = await indicadoresDeCarga(cargaId);
    // Si la retiraron justo mientras se calculaba, tampoco se entrega
    if (datos.carga.estado !== 'publicada') throw noEncontrada();

    return {
        carga: {
            id: datos.carga.id,
            fuente: { nombre: datos.carga.fuente.nombre, institucion: datos.carga.fuente.institucion },
            periodoDesde: datos.carga.periodoDesde,
            periodoHasta: datos.carga.periodoHasta,
            publicadaEn: carga.publicadaEn ? carga.publicadaEn.toISOString() : null,
        },
        estructura: datos.estructura,
        totalRegistros: datos.totalRegistros,
        indicadores: datos.indicadores,
    };
}
