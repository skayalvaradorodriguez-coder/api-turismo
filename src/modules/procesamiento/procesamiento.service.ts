import { readFile } from 'node:fs/promises';
import { RAIZ_ORIGINALES } from '../../config/storage';
import { extensionDe, rutaDentro } from '../../utils/archivos';
import { AppError } from '../../utils/AppError';
import { enTransaccion } from '../../utils/transaccion';
import type { Ejecutor } from '../auditoria/auditoria.repository';
import { registrar } from '../auditoria/auditoria.service';
import * as cargasRepo from '../cargas/cargas.repository';
import type { ArchivoOriginal, Carga } from '../cargas/cargas.repository';
import type { EstadoCarga } from '../cargas/cargas.schemas';
import * as fuentesRepo from '../fuentes/fuentes.repository';
import type { Actor } from '../fuentes/fuentes.service';
import { procesarCatastro } from './catastro.reglas';
import * as repo from './procesamiento.repository';
import type {
    FiltroHallazgos,
    FiltroRegistros,
    HallazgoGuardado,
    Procesamiento,
    RegistroGuardado,
    ResumenHallazgo,
    TipoProcesamiento,
} from './procesamiento.repository';

/**
 * Codigo de la fuente cuyas cargas se procesan con las reglas del Catastro Turistico.
 * El codigo de una fuente no cambia nunca, asi que sirve para saber que reglas aplicar.
 * Cuando haya otra fuente con procesamiento propio, se agregara aqui su codigo y sus reglas.
 */
export const CODIGO_FUENTE_CATASTRO = 'catastro_turistico';

// Un archivo de datos mas grande que esto no se procesa en memoria
const MAX_BYTES_PROCESAR = 50 * 1024 * 1024;

const ESTADOS_VALIDABLES: readonly EstadoCarga[] = ['recibida', 'validada'];

/** Al procesar, la carga sube a nivel 2 (procesada). El nivel 3 (integrada) llegara con la integracion. */
const NIVEL_INGRESO_PROCESADA = 2;

export interface ResultadoProcesamiento {
    procesamiento: Procesamiento;
    resumen: ResumenHallazgo[];
    estadoCarga: EstadoCarga;
}

const cargaNoEncontrada = () => new AppError('La carga no existe', 404, 'CARGA_NO_ENCONTRADA');
const cargaCambio = () =>
    new AppError('La carga cambio mientras se procesaba. Vuelve a intentarlo', 409, 'CARGA_CAMBIO');

interface Entrada {
    carga: Carga;
    archivo: ArchivoOriginal;
}

/** Reune lo necesario para procesar: la carga, su fuente (debe tener procesamiento) y su unico archivo vigente. */
async function cargarEntrada(cargaId: number, ejecutor?: Ejecutor): Promise<Entrada> {
    const carga = await cargasRepo.buscarCargaPorId(cargaId, ejecutor);
    if (!carga) throw cargaNoEncontrada();

    const fuente = await fuentesRepo.buscarPorId(carga.fuenteId, ejecutor);
    if (!fuente || fuente.codigo !== CODIGO_FUENTE_CATASTRO) {
        throw new AppError('Esta fuente todavia no tiene un procesamiento disponible', 422, 'FUENTE_SIN_PROCESADOR');
    }

    const vigentes = (await cargasRepo.listarArchivos(cargaId, ejecutor)).filter((a) => a.vigente);
    if (vigentes.length === 0) throw new AppError('La carga no tiene archivos', 422, 'SIN_ARCHIVO');
    const archivo = vigentes[0] as ArchivoOriginal;
    if (vigentes.length > 1) {
        throw new AppError('La carga tiene varios archivos vigentes; el Catastro se procesa de a uno', 422, 'VARIOS_ARCHIVOS');
    }
    if (extensionDe(archivo.nombreOriginal) !== 'csv') {
        throw new AppError('El Catastro debe ser un archivo CSV', 422, 'FORMATO_NO_SOPORTADO');
    }
    if (archivo.tamanoBytes > MAX_BYTES_PROCESAR) {
        throw new AppError('El archivo es demasiado grande para procesarlo', 422, 'ARCHIVO_MUY_GRANDE_PARA_PROCESAR');
    }
    return { carga, archivo };
}

/** Lee el original guardado (nunca se modifica). */
async function leerTexto(archivo: ArchivoOriginal): Promise<string> {
    let texto: string;
    try {
        texto = await readFile(rutaDentro(RAIZ_ORIGINALES, archivo.nombreAlmacenado), 'utf8');
    } catch {
        throw new AppError('El archivo no esta disponible en el almacenamiento', 404, 'ARCHIVO_NO_DISPONIBLE');
    }
    // El caracter de reemplazo aparece cuando el archivo no esta en UTF-8 (por ejemplo, Excel en Windows)
    if (texto.includes('\uFFFD')) {
        throw new AppError('El archivo debe estar guardado con codificacion UTF-8', 422, 'CODIFICACION_INVALIDA');
    }
    return texto;
}

/**
 * Si algo inesperado falla (no una regla del negocio), queda constancia de la ejecucion fallida en una
 * transaccion aparte, porque la principal ya se deshizo. Si tampoco se puede anotar, se ignora.
 */
async function anotarFallo(error: unknown, cargaId: number, archivoId: number, tipo: TipoProcesamiento, actor: Actor): Promise<void> {
    if (error instanceof AppError) return;
    try {
        await enTransaccion(async (conexion) => {
            const id = await repo.crearProcesamiento({ cargaId, archivoId, tipo, ejecutadoPor: actor.id }, conexion);
            await repo.finalizarProcesamiento(
                id,
                { estado: 'fallido', totalFilas: 0, totalErrores: 0, totalAlertas: 0, mensajeError: 'Error interno durante el proceso' },
                conexion,
            );
            await registrar(
                {
                    usuarioId: actor.id,
                    accion: 'procesamiento.fallo',
                    entidad: 'carga',
                    entidadId: cargaId,
                    detalle: { procesamientoId: id, archivoId, tipo },
                    ip: actor.ip ?? null,
                },
                conexion,
            );
        });
    } catch {
        // no hay nada mas que hacer: se vuelve a lanzar el error original
    }
}

async function resultadoDe(procesamientoId: number, cargaId: number): Promise<ResultadoProcesamiento> {
    const [procesamiento, resumen, carga] = await Promise.all([
        repo.buscarProcesamiento(procesamientoId),
        repo.resumirHallazgos(procesamientoId),
        cargasRepo.buscarCargaPorId(cargaId),
    ]);
    if (!procesamiento || !carga) throw new AppError('El procesamiento no existe', 404, 'PROCESAMIENTO_NO_ENCONTRADO');
    return { procesamiento, resumen, estadoCarga: carga.estado };
}

// ---------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------

/**
 * Revisa el archivo de la carga sin guardar datos: anota los hallazgos. Si no hay errores, la carga pasa a
 * 'validada'; si hay errores (y estaba 'validada'), vuelve a 'recibida' para que no quede un estado falso.
 */
export async function validarCarga(cargaId: number, actor: Actor): Promise<ResultadoProcesamiento> {
    const antes = await cargarEntrada(cargaId);
    if (!ESTADOS_VALIDABLES.includes(antes.carga.estado)) {
        throw new AppError('Solo se puede validar una carga recibida o validada', 409, 'CARGA_NO_VALIDABLE');
    }
    const resultado = procesarCatastro(await leerTexto(antes.archivo));

    try {
        const procesamientoId = await enTransaccion(async (conexion) => {
            const { carga, archivo } = await cargarEntrada(cargaId, conexion);
            if (archivo.id !== antes.archivo.id || !ESTADOS_VALIDABLES.includes(carga.estado)) throw cargaCambio();

            const id = await repo.crearProcesamiento({ cargaId, archivoId: archivo.id, tipo: 'validacion', ejecutadoPor: actor.id }, conexion);
            await repo.insertarHallazgos(id, resultado.hallazgos, conexion);
            await repo.finalizarProcesamiento(
                id,
                { estado: 'completado', totalFilas: resultado.totalFilas, totalErrores: resultado.totalErrores, totalAlertas: resultado.totalAlertas },
                conexion,
            );

            let estadoFinal: EstadoCarga = carga.estado;
            if (resultado.totalErrores === 0 && carga.estado === 'recibida') {
                if (!(await cargasRepo.transicionarEstado(cargaId, ['recibida'], 'validada', null, conexion))) throw cargaCambio();
                estadoFinal = 'validada';
            } else if (resultado.totalErrores > 0 && carga.estado === 'validada') {
                if (!(await cargasRepo.transicionarEstado(cargaId, ['validada'], 'recibida', null, conexion))) throw cargaCambio();
                estadoFinal = 'recibida';
            }

            await registrar(
                {
                    usuarioId: actor.id,
                    accion: 'procesamiento.validar',
                    entidad: 'carga',
                    entidadId: cargaId,
                    detalle: {
                        procesamientoId: id,
                        archivoId: archivo.id,
                        totalFilas: resultado.totalFilas,
                        totalErrores: resultado.totalErrores,
                        totalAlertas: resultado.totalAlertas,
                        estadoCarga: estadoFinal,
                    },
                    ip: actor.ip ?? null,
                },
                conexion,
            );
            return id;
        });
        return await resultadoDe(procesamientoId, cargaId);
    } catch (error) {
        await anotarFallo(error, cargaId, antes.archivo.id, 'validacion', actor);
        throw error;
    }
}

/**
 * Guarda los registros normalizados del Catastro. Solo una vez por carga y solo si la carga esta 'validada'
 * con una validacion sin errores hecha sobre el mismo archivo. El original no se toca.
 */
export async function procesarCarga(cargaId: number, actor: Actor): Promise<ResultadoProcesamiento> {
    const antes = await cargarEntrada(cargaId);
    if (antes.carga.estado !== 'validada') {
        throw new AppError('Solo se puede procesar una carga validada', 409, 'CARGA_NO_PROCESABLE');
    }
    const validacion = (await repo.listarProcesamientos(cargaId)).find((p) => p.tipo === 'validacion' && p.estado === 'completado');
    if (!validacion || validacion.archivoId !== antes.archivo.id || validacion.totalErrores > 0) {
        throw new AppError('La validacion esta desactualizada. Valida la carga otra vez', 409, 'VALIDACION_DESACTUALIZADA');
    }

    const resultado = procesarCatastro(await leerTexto(antes.archivo));
    if (resultado.totalErrores > 0) {
        throw new AppError('El archivo tiene errores. Valida la carga otra vez', 409, 'ARCHIVO_CON_ERRORES');
    }

    const yaProcesada = () => new AppError('Esta carga ya fue procesada', 409, 'CARGA_YA_PROCESADA');
    try {
        const procesamientoId = await enTransaccion(async (conexion) => {
            const { archivo } = await cargarEntrada(cargaId, conexion);
            if (archivo.id !== antes.archivo.id) throw cargaCambio();
            if (await repo.existeProcesamientoCompletado(cargaId, 'procesamiento', conexion)) throw yaProcesada();

            // Comprobar y cambiar en una sola sentencia: si dos personas procesan a la vez, solo una gana
            if (!(await cargasRepo.transicionarEstado(cargaId, ['validada'], 'procesada', null, conexion, NIVEL_INGRESO_PROCESADA))) {
                throw new AppError('La carga ya no esta validada', 409, 'CARGA_NO_PROCESABLE');
            }

            const id = await repo.crearProcesamiento({ cargaId, archivoId: archivo.id, tipo: 'procesamiento', ejecutadoPor: actor.id }, conexion);
            await repo.insertarHallazgos(id, resultado.hallazgos, conexion);
            try {
                await repo.insertarRegistros(cargaId, archivo.id, resultado.registros, conexion);
            } catch (error) {
                if (cargasRepo.esDuplicadoDe(error, 'uq_catastro_carga')) throw yaProcesada();
                throw error;
            }
            await repo.finalizarProcesamiento(
                id,
                { estado: 'completado', totalFilas: resultado.totalFilas, totalErrores: 0, totalAlertas: resultado.totalAlertas },
                conexion,
            );

            await registrar(
                {
                    usuarioId: actor.id,
                    accion: 'procesamiento.procesar',
                    entidad: 'carga',
                    entidadId: cargaId,
                    detalle: {
                        procesamientoId: id,
                        archivoId: archivo.id,
                        totalFilas: resultado.totalFilas,
                        registrosGuardados: resultado.registros.length,
                        nivelIngreso: NIVEL_INGRESO_PROCESADA,
                        totalAlertas: resultado.totalAlertas,
                    },
                    ip: actor.ip ?? null,
                },
                conexion,
            );
            return id;
        });
        return await resultadoDe(procesamientoId, cargaId);
    } catch (error) {
        await anotarFallo(error, cargaId, antes.archivo.id, 'procesamiento', actor);
        throw error;
    }
}

// ---------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------

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

/**
 * Registros procesados de una carga. Con datos sensibles (ruc y propietario) solo si se pide de forma
 * explicita, y en ese caso queda constancia en la bitacora.
 */
export async function obtenerRegistros(
    cargaId: number,
    filtro: FiltroRegistros,
    incluirSensibles: boolean,
    actor: Actor,
): Promise<{ registros: RegistroGuardado[]; total: number }> {
    if (!(await cargasRepo.buscarCargaPorId(cargaId))) throw cargaNoEncontrada();
    const lista = await repo.listarRegistros(cargaId, filtro, incluirSensibles);

    if (incluirSensibles) {
        await registrar({
            usuarioId: actor.id,
            accion: 'procesamiento.ver_datos_sensibles',
            entidad: 'carga',
            entidadId: cargaId,
            detalle: { pagina: filtro.pagina, limite: filtro.limite, devueltos: lista.registros.length },
            ip: actor.ip ?? null,
        });
    }
    return lista;
}
