import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { ROLES_CONSULTA, ROLES_GESTION } from '../../config/roles';
import { asegurarCarpetas, MAX_BYTES, RAIZ_TEMPORAL } from '../../config/storage';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRol } from '../../middleware/requireRol';
import { validarBody, validarDatos } from '../../middleware/validate';
import { extensionDe, limpiarNombreOriginal, tipoPermitido } from '../../utils/archivos';
import { AppError } from '../../utils/AppError';
import type { Actor } from '../fuentes/fuentes.service';
import {
    actualizarMetadatosSchema,
    archivoParamSchema,
    crearCargaSchema,
    idCargaParamSchema,
    listarCargasQuerySchema,
    rechazarCargaSchema,
} from './cargas.schemas';
import type { ActualizarMetadatosInput, RechazarCargaInput } from './cargas.schemas';
import * as cargas from './cargas.service';
import type { ArchivoRecibido } from './cargas.service';

export const cargasRouter = Router();

// Todas las rutas de este modulo exigen sesion iniciada
cargasRouter.use(requireAuth);

// El actor sale de la sesion, nunca del cuerpo de la peticion
function actorDe(req: Request): Actor {
    if (!req.user) throw new AppError('No has iniciado sesion', 401, 'NO_AUTENTICADO');
    return { id: req.user.id, ip: req.ip };
}

// ---------------------------------------------------------------
// Recepcion del archivo (multipart/form-data)
// ---------------------------------------------------------------

/** Los navegadores mandan el nombre en UTF-8, pero el lector multipart lo entrega leido como latin1. */
function corregirNombre(nombre: string): string {
    // si ya trae caracteres fuera de latin1, no hay nada que corregir
    return /[^\u0000-\u00ff]/.test(nombre) ? nombre : Buffer.from(nombre, 'latin1').toString('utf8');
}

const recepcion = multer({
    storage: multer.diskStorage({
        destination: (_req, _archivo, cb) => {
            asegurarCarpetas();
            cb(null, RAIZ_TEMPORAL);
        },
        // el nombre en disco lo decide el sistema; el que manda el usuario nunca se usa como ruta
        filename: (_req, _archivo, cb) => cb(null, `${randomUUID()}.tmp`),
    }),
    limits: {
        fileSize: MAX_BYTES,
        files: 1, // un solo archivo por peticion
        fields: 20,
        fieldSize: 128 * 1024, // alcanza para 50 metadatos de hasta 1000 caracteres
        parts: 25,
    },
    // se descarta ya al empezar un tipo no permitido, sin recibir todos sus bytes
    fileFilter: (_req, archivo, cb) => {
        const nombre = limpiarNombreOriginal(corregirNombre(archivo.originalname));
        const extension = nombre ? extensionDe(nombre) : null;
        if (!extension || !tipoPermitido(extension)) {
            cb(new AppError('Ese tipo de archivo no esta permitido', 422, 'TIPO_ARCHIVO_NO_PERMITIDO'));
            return;
        }
        cb(null, true);
    },
}).single('archivo');

/** Convierte los errores de multer en errores de la API con un mensaje claro. */
function traducirErrorDeSubida(error: unknown): unknown {
    if (!(error instanceof multer.MulterError)) return error;
    switch (error.code) {
        case 'LIMIT_FILE_SIZE':
            return new AppError(
                `El archivo supera el tamano maximo de ${Math.floor(MAX_BYTES / (1024 * 1024))} MB`,
                413,
                'ARCHIVO_MUY_GRANDE',
            );
        case 'LIMIT_UNEXPECTED_FILE':
            return new AppError('Envia un solo archivo en el campo "archivo"', 422, 'ARCHIVO_INESPERADO');
        default:
            return new AppError('La peticion de carga no es valida', 422, 'SUBIDA_INVALIDA');
    }
}

/** Recibe el archivo (campo "archivo") y deja en req.file su ubicacion temporal. */
const recibirArchivo: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    recepcion(req, res, (error: unknown) => (error ? next(traducirErrorDeSubida(error)) : next()));
};

/** El archivo recibido, listo para el servicio. Falla si la peticion no trajo archivo. */
function archivoDe(req: Request): ArchivoRecibido {
    if (!req.file) throw new AppError('Debes enviar un archivo en el campo "archivo"', 422, 'ARCHIVO_REQUERIDO');
    return { rutaTemporal: req.file.path, nombreOriginal: corregirNombre(req.file.originalname) };
}

/** Si algo falla antes de que el servicio tome el archivo, no debe quedar en la carpeta temporal. */
async function descartarTemporal(req: Request): Promise<void> {
    if (!req.file) return;
    try {
        await unlink(req.file.path);
    } catch {
        // ya no estaba
    }
}

// ---------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------
cargasRouter.get('/', requireRol(...ROLES_CONSULTA), async (req, res) => {
    const consulta = validarDatos(listarCargasQuerySchema, req.query);
    const { cargas: lista, total } = await cargas.listarCargas(consulta);
    res.json({ ok: true, data: { cargas: lista, total, pagina: consulta.pagina, limite: consulta.limite } });
});

cargasRouter.get('/:id', requireRol(...ROLES_CONSULTA), async (req, res) => {
    const { id } = validarDatos(idCargaParamSchema, req.params);
    res.json({ ok: true, data: await cargas.obtenerCarga(id) });
});

cargasRouter.get('/:id/archivos/:archivoId/descarga', requireRol(...ROLES_CONSULTA), async (req, res) => {
    const { id, archivoId } = validarDatos(archivoParamSchema, req.params);
    const descarga = await cargas.prepararDescarga(id, archivoId, actorDe(req));

    await new Promise<void>((resolve, reject) => {
        res.download(
            descarga.ruta,
            descarga.nombreOriginal,
            {
                headers: {
                    // el tipo sale de nuestra tabla, nunca de lo que dijo el navegador al subirlo
                    'Content-Type': descarga.tipoMime,
                    'X-Content-Type-Options': 'nosniff',
                    'Cache-Control': 'private, no-store',
                },
            },
            (error) => (error && !res.headersSent ? reject(error) : resolve()),
        );
    });
});

// ---------------------------------------------------------------
// Operaciones (solo roles de gestion). El permiso se revisa ANTES de recibir el archivo.
// ---------------------------------------------------------------
cargasRouter.post('/', requireRol(...ROLES_GESTION), recibirArchivo, async (req, res) => {
    try {
        const datos = validarDatos(crearCargaSchema, req.body);
        const detalle = await cargas.crearCarga(datos, archivoDe(req), actorDe(req));
        res.status(201).json({ ok: true, data: detalle });
    } catch (error) {
        await descartarTemporal(req);
        throw error;
    }
});

cargasRouter.post('/:id/archivos', requireRol(...ROLES_GESTION), recibirArchivo, async (req, res) => {
    try {
        const { id } = validarDatos(idCargaParamSchema, req.params);
        const detalle = await cargas.agregarArchivo(id, archivoDe(req), actorDe(req));
        res.status(201).json({ ok: true, data: detalle });
    } catch (error) {
        await descartarTemporal(req);
        throw error;
    }
});

cargasRouter.patch('/:id/metadatos', requireRol(...ROLES_GESTION), validarBody(actualizarMetadatosSchema), async (req, res) => {
    const { id } = validarDatos(idCargaParamSchema, req.params);
    const detalle = await cargas.actualizarMetadatos(id, req.body as ActualizarMetadatosInput, actorDe(req));
    res.json({ ok: true, data: detalle });
});

cargasRouter.post('/:id/rechazo', requireRol(...ROLES_GESTION), validarBody(rechazarCargaSchema), async (req, res) => {
    const { id } = validarDatos(idCargaParamSchema, req.params);
    const { motivo } = req.body as RechazarCargaInput;
    res.json({ ok: true, data: await cargas.rechazarCarga(id, motivo, actorDe(req)) });
});