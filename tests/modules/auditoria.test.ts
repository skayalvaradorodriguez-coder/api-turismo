import type { RowDataPacket } from 'mysql2';
import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/config/db';
import { registrar } from '../../src/modules/auditoria/auditoria.service';

afterAll(async () => {
    await pool.end();
});

describe('registrar (con la base real; se deshace al final)', () => {
    it('guarda el evento, oculta datos sensibles y no deja nada tras el rollback', async () => {
        const conexion = await pool.getConnection();
        try {
            await conexion.beginTransaction();
            await registrar(
                {
                    accion: 'prueba.evento',
                    entidad: 'prueba',
                    entidadId: 7,
                    detalle: { estado: 'recibida', password: 'valor-secreto-1' },
                    ip: '127.0.0.1',
                },
                conexion,
            );

            const [filas] = await conexion.query<RowDataPacket[]>(
                "SELECT accion, entidad, entidad_id, detalle FROM bitacora WHERE accion = 'prueba.evento'",
            );
            expect(filas).toHaveLength(1);
            expect(filas[0]?.['entidad_id']).toBe(7);

            const crudo: unknown = filas[0]?.['detalle'];
            const detalle = (typeof crudo === 'string' ? JSON.parse(crudo) : crudo) as Record<string, unknown>;
            expect(detalle['estado']).toBe('recibida');
            expect(detalle['password']).toBe('[OCULTO]');
            expect(JSON.stringify(filas)).not.toContain('valor-secreto-1');
        } finally {
            await conexion.rollback();
            conexion.release();
        }

        const [despues] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS total FROM bitacora WHERE accion = 'prueba.evento'",
        );
        expect(despues[0]?.['total']).toBe(0);
    });
});