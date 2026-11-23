import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';

// Forma de la respuesta del servicio de procesamiento (ver arquitectura/contrato-api-procesamiento).
// Se valida aqui: la API no confia en que el otro servicio responda siempre bien.
const texto = z.string().nullable();

const respuestaSchema = z.object({
    estructura: z.object({ codigo: z.string(), nombre: z.string() }).nullable(),
    formato: z.string(),
    hoja: texto,
    resumen: z.object({
        filas_leidas: z.number().int(),
        filas_validas: z.number().int(),
        filas_excluidas: z.number().int(),
        errores: z.number().int(),
        alertas: z.number().int(),
    }),
    hallazgos: z.array(
        z.object({
            fila: z.number().int().nullable(),
            columna: texto,
            regla: z.string(),
            severidad: z.enum(['error', 'alerta']),
            mensaje: z.string(),
            valor_original: texto,
            valor_corregido: texto,
        }),
    ),
    hallazgos_truncados: z.boolean().default(false),
    // Solo vienen al procesar
    cambios: z
        .array(
            z.object({
                fila: z.number().int(),
                columna: z.string(),
                regla: z.string(),
                valor_original: texto,
                valor_nuevo: z.union([z.string(), z.number(), z.null()]),
            }),
        )
        .default([]),
    cambios_truncados: z.boolean().default(false),
    alertas_normalizacion: z
        .array(z.object({ fila: z.number().int(), columna: z.string(), regla: z.string(), mensaje: z.string() }))
        .default([]),
    registros: z
        .array(z.object({ fila_origen: z.number().int(), identificador: z.string(), datos: z.record(z.string(), z.unknown()) }))
        .default([]),
});

export type RespuestaServicio = z.infer<typeof respuestaSchema>;
export type OperacionServicio = 'validar' | 'procesar';

const noDisponible = () =>
    new AppError('El servicio de procesamiento no esta disponible', 502, 'SERVICIO_PROCESAMIENTO_NO_DISPONIBLE');

/** Envia el archivo al servicio de procesamiento y devuelve su respuesta ya validada. */
export async function consultarServicio(operacion: OperacionServicio, ruta: string, nombreOriginal: string): Promise<RespuestaServicio> {
    const clave = env.PROCESAMIENTO_CLAVE;
    if (!clave) throw new AppError('El servicio de procesamiento no esta configurado', 503, 'PROCESAMIENTO_NO_CONFIGURADO');

    const formulario = new FormData();
    formulario.append('archivo', new Blob([new Uint8Array(await readFile(ruta))]), nombreOriginal);

    let respuesta: Response;
    try {
        respuesta = await fetch(`${env.PROCESAMIENTO_URL}/v1/${operacion}`, {
            method: 'POST',
            headers: { 'X-Internal-Key': clave },
            body: formulario,
            signal: AbortSignal.timeout(env.PROCESAMIENTO_TIMEOUT_SEG * 1000),
        });
    } catch {
        throw noDisponible();
    }

    let cuerpo: unknown;
    try {
        cuerpo = await respuesta.json();
    } catch {
        throw new AppError('El servicio de procesamiento respondio algo inesperado', 502, 'SERVICIO_PROCESAMIENTO_ERROR');
    }

    if (!respuesta.ok) {
        // 413 y 422: el archivo no se pudo leer. Es un problema del archivo, no del servicio
        if (respuesta.status === 413 || respuesta.status === 422) {
            const error = z.object({ codigo: z.string(), mensaje: z.string() }).safeParse(cuerpo);
            if (error.success) {
                throw new AppError(error.data.mensaje, 422, `ARCHIVO_${error.data.codigo.toUpperCase()}`);
            }
        }
        // El resto (clave rechazada, errores internos) no se detalla hacia afuera
        throw new AppError('El servicio de procesamiento no pudo completar la operacion', 502, 'SERVICIO_PROCESAMIENTO_ERROR');
    }

    const valida = respuestaSchema.safeParse(cuerpo);
    if (!valida.success) {
        throw new AppError('El servicio de procesamiento respondio algo inesperado', 502, 'SERVICIO_PROCESAMIENTO_ERROR');
    }
    return valida.data;
}
