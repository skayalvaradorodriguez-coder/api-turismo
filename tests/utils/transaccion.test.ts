import { beforeEach, describe, expect, it, vi } from 'vitest';

const { conexion } = vi.hoisted(() => ({
    conexion: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() },
}));

vi.mock('../../src/config/db', () => ({
    pool: { getConnection: vi.fn(async () => conexion) },
}));

import { enTransaccion } from '../../src/utils/transaccion';

describe('enTransaccion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('confirma los cambios y devuelve el resultado si todo sale bien', async () => {
        const resultado = await enTransaccion(async (c) => {
            expect(c).toBe(conexion);
            return 42;
        });

        expect(resultado).toBe(42);
        expect(conexion.beginTransaction).toHaveBeenCalledOnce();
        expect(conexion.commit).toHaveBeenCalledOnce();
        expect(conexion.rollback).not.toHaveBeenCalled();
        expect(conexion.release).toHaveBeenCalledOnce();
    });

    it('deshace los cambios y relanza el error si algo falla', async () => {
        const error = new Error('fallo');

        await expect(
            enTransaccion(async () => {
                throw error;
            }),
        ).rejects.toBe(error);

        expect(conexion.commit).not.toHaveBeenCalled();
        expect(conexion.rollback).toHaveBeenCalledOnce();
        expect(conexion.release).toHaveBeenCalledOnce();
    });
});