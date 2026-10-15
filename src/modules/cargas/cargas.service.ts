import { access, rename, stat, unlink } from 'node:fs/promises';
import { RAIZ_ORIGINALES } from '../../config/storage';
import {
    contenidoCoincide,
    extensionDe,
    leerCabecera,
    limpiarNombreOriginal,
    nombreAleatorio,
    rutaDentro,
    sha256DeArchivo,
    tipoPermitido,
} from '../../utils/archivos';
import { AppError } from '../../utils/AppError';
import { enTransaccion } from '../../utils/transaccion';
import { registrar } from '../auditoria/auditoria.service';
import * as fuentesRepo from '../fuentes/fuentes.repository';
import type { Actor } from '../fuentes/fuentes.service';
import * as repo from './cargas.repository';
import type { ArchivoOriginal, Carga, Metadato } from './cargas.repository';
import type { ActualizarMetadatosInput, CrearCargaInput, ListarCargasQuery } from './cargas.schemas';

/** Archivo que ya llego al servidor (carpeta temporal) y todavia no fue aceptado. */
export interface ArchivoRecibido {
    rutaTemporal: string;
    nombreOriginal: string;
}

export interface DetalleCarga {
    carga: Carga;
    archivos: ArchivoOriginal[];
    metadatos: Metadato[];
}

export interface DescargaArchivo {
    ruta: string;
    nombreOriginal: string;
    tipoMime: string;
    tamanoBytes: number;
}

// Estados en los que todavia se puede agregar archivos, cambiar metadatos o rechazar
const ESTADOS_ABIERTOS = ['recibida', 'validada'] as const;

const cargaNoEncontrada = () => new AppError('La carga no existe', 404, 'CARGA_NO_ENCONTRADA');
const cargaCerrada = () =>
    new AppError('La carga ya no admite cambios en su estado actual', 409, 'CARGA_NO_EDITABLE');

async function borrarSilencioso(ruta: string): Promise<void> {
    try {
        await unlink(ruta);
    } catch {
        // si ya no existe, no hay nada que limpiar
    }
}

interface ArchivoRevisado {
    nombreOriginal: string;
    tipoMime: string;
    tamanoBytes: number;
    sha256: string;
    nombreAlmacenado: string;
    rutaTemporal: string;
}

/** Revisa el archivo recibido (nombre, tipo, contenido real, tamano y huella). No lo mueve todavia. */
async function revisarArchivo(recibido: ArchivoRecibido): Promise<ArchivoRevisado> {
    const nombreOriginal = limpiarNombreOriginal(recibido.nombreOriginal);
    if (!nombreOriginal) throw new AppError('El nombre del archivo no es valido', 422, 'NOMBRE_ARCHIVO_INVALIDO');

    const extension = extensionDe(nombreOriginal);
    const tipo = extension ? tipoPermitido(extension) : undefined;
    if (!extension || !tipo) {
        throw new AppError('Ese tipo de archivo no esta permitido', 422, 'TIPO_ARCHIVO_NO_PERMITIDO');
    }

    const { size } = await stat(recibido.rutaTemporal);
    if (size === 0) throw new AppError('El archivo esta vacio', 422, 'ARCHIVO_VACIO');

    if (!contenidoCoincide(extension, await leerCabecera(recibido.rutaTemporal))) {
        throw new AppError('El contenido del archivo no corresponde a su extension', 422, 'CONTENIDO_NO_COINCIDE');
    }

    return {
        nombreOriginal,
        tipoMime: tipo.mime,
        tamanoBytes: size,
        sha256: await sha256DeArchivo(recibido.rutaTemporal),
        nombreAlmacenado: nombreAleatorio(extension),
        rutaTemporal: recibido.rutaTemporal,
    };
}

/**
 * Guarda el archivo dentro de la transaccion: registra en la base, mueve el archivo a "originales"
 * y anota en la bitacora. Si algo falla despues de mover, el archivo movido se borra.
 */
async function guardarArchivo(
    conexion: import('mysql2/promise').PoolConnection,
    cargaId: number,
    revisado: ArchivoRevisado,
    actor: Actor,
): Promise<{ archivoId: number; destino: string }> {
    let archivoId: number;
    try {
        archivoId = await repo.insertarArchivo(
            {
                cargaId,
                nombreOriginal: revisado.nombreOriginal,
                nombreAlmacenado: revisado.nombreAlmacenado,
                tipoMime: revisado.tipoMime,
                tamanoBytes: revisado.tamanoBytes,
                sha256: revisado.sha256,
                subidoPor: actor.id,
            },
            conexion,
        );
    } catch (error) {
        if (repo.esDuplicadoDe(error, 'uq_archivos_carga_sha')) {
            throw new AppError('Ese mismo archivo ya fue cargado en esta carga', 409, 'ARCHIVO_DUPLICADO');
        }
        throw error;
    }

    const destino = rutaDentro(RAIZ_ORIGINALES, revisado.nombreAlmacenado);
    await rename(revisado.rutaTemporal, destino);
    return { archivoId, destino };
}

// ---------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------

/** Crea una carga nueva con su primer archivo y sus metadatos, todo junto o nada. */
export async function crearCarga(
    datos: CrearCargaInput,
    recibido: ArchivoRecibido,
    actor: Actor,
): Promise<DetalleCarga> {
    let movido: string | null = null;
    try {
        const revisado = await revisarArchivo(recibido);

        const cargaId = await enTransaccion(async (conexion) => {
            const fuente = await fuentesRepo.buscarPorId(datos.fuenteId, conexion);
            if (!fuente) throw new AppError('La fuente no existe', 404, 'FUENTE_NO_ENCONTRADA');
            if (fuente.estado !== 'activa') {
                throw new AppError('La fuente esta inactiva', 409, 'FUENTE_INACTIVA');
            }
            if (
                datos.estructuraId !== undefined &&
                !(await repo.estructuraPerteneceAFuente(datos.estructuraId, datos.fuenteId, conexion))
            ) {
                throw new AppError('La estructura no pertenece a esa fuente', 422, 'ESTRUCTURA_INVALIDA');
            }

            const id = await repo.crearCarga(
                {
                    fuenteId: datos.fuenteId,
                    estructuraId: datos.estructuraId ?? null,
                    descripcion: datos.descripcion,
                    periodoDesde: datos.periodoDesde ?? null,
                    periodoHasta: datos.periodoHasta ?? null,
                    nivelIngreso: datos.nivelIngreso,
                    cargadoPor: actor.id,
                },
                conexion,
            );
            await repo.guardarMetadatos(id, datos.metadatos, conexion);
            const { archivoId, destino } = await guardarArchivo(conexion, id, revisado, actor);
            movido = destino;

            await registrar(
                {
                    usuarioId: actor.id,
                    accion: 'carga.crear',
                    entidad: 'carga',
                    entidadId: id,
                    detalle: {
                        fuenteId: datos.fuenteId,
                        archivoId,
                        nombreOriginal: revisado.nombreOriginal,
                        sha256: revisado.sha256,
                        tamanoBytes: revisado.tamanoBytes,
                        metadatos: Object.keys(datos.metadatos),
                    },
                    ip: actor.ip ?? null,
                },
                conexion,
            );
            return id;
        });
        return await obtenerCarga(cargaId);
    } catch (error) {
        if (movido) await borrarSilencioso(movido);
        throw error;
    } finally {
        await borrarSilencioso(recibido.rutaTemporal); // si ya se movio, no hay nada que borrar
    }
}

/** Agrega un archivo a una carga existente (si el nombre ya existia, queda como version nueva). */
export async function agregarArchivo(cargaId: number, recibido: ArchivoRecibido, actor: Actor): Promise<DetalleCarga> {
    let movido: string | null = null;
    try {
        const revisado = await revisarArchivo(recibido);

        await enTransaccion(async (conexion) => {
            const carga = await repo.buscarCargaPorId(cargaId, conexion);
            if (!carga) throw cargaNoEncontrada();
            if (!(ESTADOS_ABIERTOS as readonly string[]).includes(carga.estado)) throw cargaCerrada();

            const { archivoId, destino } = await guardarArchivo(conexion, cargaId, revisado, actor);
            movido = destino;

            await registrar(
                {
                    usuarioId: actor.id,
                    accion: 'carga.archivo_agregar',
                    entidad: 'carga',
                    entidadId: cargaId,
                    detalle: {
                        archivoId,
                        nombreOriginal: revisado.nombreOriginal,
                        sha256: revisado.sha256,
                        tamanoBytes: revisado.tamanoBytes,
                    },
                    ip: actor.ip ?? null,
                },
                conexion,
            );
        });
        return await obtenerCarga(cargaId);
    } catch (error) {
        if (movido) await borrarSilencioso(movido);
        throw error;
    } finally {
        await borrarSilencioso(recibido.rutaTemporal);
    }
}

export async function rechazarCarga(cargaId: number, motivo: string, actor: Actor): Promise<DetalleCarga> {
    await enTransaccion(async (conexion) => {
        const carga = await repo.buscarCargaPorId(cargaId, conexion);
        if (!carga) throw cargaNoEncontrada();

        const cambio = await repo.transicionarEstado(cargaId, [...ESTADOS_ABIERTOS], 'rechazada', motivo, conexion);
        if (!cambio) throw cargaCerrada();

        await registrar(
            {
                usuarioId: actor.id,
                accion: 'carga.rechazar',
                entidad: 'carga',
                entidadId: cargaId,
                detalle: { estadoAnterior: carga.estado, motivo },
                ip: actor.ip ?? null,
            },
            conexion,
        );
    });
    return obtenerCarga(cargaId);
}

export async function actualizarMetadatos(
    cargaId: number,
    datos: ActualizarMetadatosInput,
    actor: Actor,
): Promise<DetalleCarga> {
    await enTransaccion(async (conexion) => {
        const carga = await repo.buscarCargaPorId(cargaId, conexion);
        if (!carga) throw cargaNoEncontrada();
        if (!(ESTADOS_ABIERTOS as readonly string[]).includes(carga.estado)) throw cargaCerrada();

        await repo.guardarMetadatos(cargaId, datos.metadatos, conexion);

        await registrar(
            {
                usuarioId: actor.id,
                accion: 'carga.metadatos',
                entidad: 'carga',
                entidadId: cargaId,
                detalle: { claves: Object.keys(datos.metadatos) },
                ip: actor.ip ?? null,
            },
            conexion,
        );
    });
    return obtenerCarga(cargaId);
}

export async function listarCargas(consulta: ListarCargasQuery): Promise<{ cargas: Carga[]; total: number }> {
    return repo.listarCargas({
        ...(consulta.fuenteId !== undefined ? { fuenteId: consulta.fuenteId } : {}),
        ...(consulta.estado !== undefined ? { estado: consulta.estado } : {}),
        limite: consulta.limite,
        pagina: consulta.pagina,
    });
}

export async function obtenerCarga(cargaId: number): Promise<DetalleCarga> {
    const carga = await repo.buscarCargaPorId(cargaId);
    if (!carga) throw cargaNoEncontrada();
    const [archivos, metadatos] = await Promise.all([repo.listarArchivos(cargaId), repo.listarMetadatos(cargaId)]);
    return { carga, archivos, metadatos };
}

/** Prepara la descarga de un original y deja constancia en la bitacora. */
export async function prepararDescarga(cargaId: number, archivoId: number, actor: Actor): Promise<DescargaArchivo> {
    const carga = await repo.buscarCargaPorId(cargaId);
    if (!carga) throw cargaNoEncontrada();
    const archivo = await repo.buscarArchivo(archivoId, cargaId);
    if (!archivo) throw new AppError('El archivo no existe', 404, 'ARCHIVO_NO_ENCONTRADO');

    const ruta = rutaDentro(RAIZ_ORIGINALES, archivo.nombreAlmacenado);
    try {
        await access(ruta);
    } catch {
        throw new AppError('El archivo no esta disponible en el almacenamiento', 404, 'ARCHIVO_NO_DISPONIBLE');
    }

    await registrar({
        usuarioId: actor.id,
        accion: 'carga.descargar',
        entidad: 'carga',
        entidadId: cargaId,
        detalle: { archivoId, nombreOriginal: archivo.nombreOriginal, sha256: archivo.sha256 },
        ip: actor.ip ?? null,
    });

    return {
        ruta,
        nombreOriginal: archivo.nombreOriginal,
        tipoMime: archivo.tipoMime,
        tamanoBytes: archivo.tamanoBytes,
    };
}