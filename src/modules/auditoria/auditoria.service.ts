import { detalleAJson } from './auditoria.detalle';
import { insertar } from './auditoria.repository';
import type { Ejecutor, EventoBitacora } from './auditoria.repository';

export type { EventoBitacora } from './auditoria.repository';

/**
 * Anota un evento en la bitacora. Si la operacion principal usa una transaccion, pasa su conexion:
 * asi el cambio y su registro se guardan juntos o no se guarda ninguno.
 */
export async function registrar(evento: EventoBitacora, ejecutor?: Ejecutor): Promise<void> {
    await insertar(
        {
            ...evento,
            accion: evento.accion.slice(0, 60),
            entidad: evento.entidad.slice(0, 40),
            ip: evento.ip ? evento.ip.slice(0, 45) : null,
        },
        detalleAJson(evento.detalle),
        ejecutor,
    );
}