import { access } from 'node:fs/promises';
import { RAIZ_ORIGINALES } from '../../config/storage';
import { AppError } from '../../utils/AppError';
import { rutaDentro } from '../../utils/archivos';
import { enTransaccion } from '../../utils/transaccion';
import { registrar } from '../auditoria/auditoria.service';
import * as cargasRepo from '../cargas/cargas.repository';
import type { Actor } from '../fuentes/fuentes.service';
import { consultarServicio } from './procesamiento.cliente';
import { aHallazgos } from './procesamiento.mapeo';
import * as repo from './procesamiento.repository';
import type { FiltroHallazgos, HallazgoGuardado, Procesamiento, ResumenHallazgo } from './procesamiento.repository';
import type { EjecutarProcesamientoInput } from './procesamiento.schemas';

// Este modulo consulta el historial de procesamientos y sus hallazgos, y ejecuta la validacion y el
// procesamiento de un archivo: el trabajo lo hace el servicio de procesamiento (Python) y aqui se guarda el resultado.

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


export interface ResultadoEjecucion {
    procesamiento: Procesamiento;
    estructura: { codigo: string; nombre: string } | null;
    resumen: { filasLeidas: number; filasValidas: number; filasExcluidas: number; errores: number; alertas: number };
    registrosGuardados: number;
}

// La validacion se puede repetir mientras la carga este abierta; procesar exige haber validado antes
const ESTADOS_PARA: Record<'validacion' | 'procesamiento', Array<'recibida' | 'validada'>> = {
    validacion: ['recibida', 'validada'],
    procesamiento: ['validada'],
};

const mensajeDe = (error: unknown): string => (error instanceof Error ? error.message : 'Error desconocido').slice(0, 500);

/**
 * Valida o procesa un archivo de una carga con el servicio de procesamiento y guarda el resultado:
 * hallazgos, transformaciones (trazabilidad) y, al procesar, los registros normalizados.
 * El archivo original no se modifica. Si la estructura se reconoce, la carga avanza de estado.
 */
export async function ejecutarProcesamiento(cargaId: number, entrada: EjecutarProcesamientoInput, actor: Actor): Promise<ResultadoEjecucion> {
    const carga = await cargasRepo.buscarCargaPorId(cargaId);
    if (!carga) throw cargaNoEncontrada();
    if (!(ESTADOS_PARA[entrada.tipo] as string[]).includes(carga.estado)) {
        const mensaje =
            entrada.tipo === 'procesamiento'
                ? 'Para procesar, la carga debe estar validada'
                : 'La carga ya no admite una nueva validacion en su estado actual';
        throw new AppError(mensaje, 409, 'ESTADO_NO_PERMITE_PROCESAR');
    }

    const archivo = await cargasRepo.buscarArchivo(entrada.archivoId, cargaId);
    if (!archivo) throw new AppError('El archivo no existe', 404, 'ARCHIVO_NO_ENCONTRADO');
    if (!archivo.vigente) throw new AppError('El archivo fue reemplazado por una version nueva', 409, 'ARCHIVO_NO_VIGENTE');

    const ruta = rutaDentro(RAIZ_ORIGINALES, archivo.nombreAlmacenado);
    try {
        await access(ruta);
    } catch {
        throw new AppError('El archivo no esta disponible en el almacenamiento', 404, 'ARCHIVO_NO_DISPONIBLE');
    }

    // Queda registrado desde el inicio: si algo falla, el historial muestra el intento
    const procesamientoId = await repo.crearProcesamiento({ cargaId, archivoId: archivo.id, tipo: entrada.tipo, ejecutadoPor: actor.id });
    const falla = async (error: unknown): Promise<never> => {
        await repo
            .finalizarProcesamiento(procesamientoId, { estado: 'fallido', totalFilas: 0, totalErrores: 0, totalAlertas: 0, mensajeError: mensajeDe(error) })
            .catch(() => false);
        throw error;
    };

    try {
        const respuesta = await consultarServicio(entrada.tipo === 'validacion' ? 'validar' : 'procesar', ruta, archivo.nombreOriginal);
        const { hallazgos, alertasDeNormalizacion } = aHallazgos(respuesta);
        const estructura = respuesta.estructura;
        const resumen = respuesta.resumen;
        const totalAlertas = resumen.alertas + alertasDeNormalizacion;
        const registros = entrada.tipo === 'procesamiento' && estructura ? respuesta.registros : [];

        await enTransaccion(async (conexion) => {
            await repo.insertarHallazgos(procesamientoId, hallazgos, conexion);
            if (registros.length > 0 && estructura) {
                await repo.insertarRegistros(
                    procesamientoId,
                    cargaId,
                    estructura.codigo,
                    registros.map((r) => ({ identificador: r.identificador, filaOrigen: r.fila_origen, datos: r.datos })),
                    conexion,
                );
            }

            // Procesar un archivo de estructura desconocida no es un exito
            const noReconocido = entrada.tipo === 'procesamiento' && !estructura;
            await repo.finalizarProcesamiento(
                procesamientoId,
                {
                    estado: noReconocido ? 'fallido' : 'completado',
                    totalFilas: resumen.filas_leidas,
                    totalErrores: resumen.errores,
                    totalAlertas,
                    mensajeError: noReconocido ? 'La estructura del archivo no se reconoce' : null,
                },
                conexion,
            );

            if (estructura) {
                const avanzo =
                    entrada.tipo === 'validacion'
                        ? await cargasRepo.transicionarEstado(cargaId, ['recibida', 'validada'], 'validada', null, conexion)
                        : await cargasRepo.transicionarEstado(cargaId, ['validada'], 'procesada', null, conexion, 2);
                if (!avanzo) throw new AppError('El estado de la carga cambio mientras se procesaba', 409, 'ESTADO_NO_PERMITE_PROCESAR');
            }

            await registrar(
                {
                    usuarioId: actor.id,
                    accion: entrada.tipo === 'validacion' ? 'carga.validar' : 'carga.procesar',
                    entidad: 'carga',
                    entidadId: cargaId,
                    detalle: {
                        procesamientoId,
                        archivoId: archivo.id,
                        estructura: estructura?.codigo ?? null,
                        filas: resumen.filas_leidas,
                        errores: resumen.errores,
                        alertas: totalAlertas,
                        registros: registros.length,
                    },
                    ip: actor.ip ?? null,
                },
                conexion,
            );
        });

        const procesamiento = await repo.buscarProcesamiento(procesamientoId);
        if (!procesamiento) throw new AppError('El procesamiento no se pudo registrar', 500, 'PROCESAMIENTO_NO_REGISTRADO');
        return {
            procesamiento,
            estructura,
            resumen: {
                filasLeidas: resumen.filas_leidas,
                filasValidas: resumen.filas_validas,
                filasExcluidas: resumen.filas_excluidas,
                errores: resumen.errores,
                alertas: totalAlertas,
            },
            registrosGuardados: registros.length,
        };
    } catch (error) {
        return falla(error);
    }
}
