import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requireRol } from '../../src/middleware/requireRol';
import { AppError } from '../../src/utils/AppError';

function peticion(rol?: string): Request {
    const user = rol ? { id: 1, nombres: 'Ana', apellidos: 'Perez', email: 'ana@example.com', rol } : undefined;
    return { user } as unknown as Request;
}

const respuesta = {} as Response;

function capturar(fn: () => void): AppError | undefined {
    try {
        fn();
    } catch (e) {
        return e as AppError;
    }
    return undefined;
}

describe('requireRol', () => {
    it('sin sesion responde 401', () => {
        const siguiente = vi.fn();
        const error = capturar(() => requireRol('super_admin')(peticion(), respuesta, siguiente));
        expect(error?.statusCode).toBe(401);
        expect(siguiente).not.toHaveBeenCalled();
    });

    it('con un rol no permitido responde 403', () => {
        const siguiente = vi.fn();
        const error = capturar(() => requireRol('super_admin', 'admin')(peticion('externo'), respuesta, siguiente));
        expect(error?.statusCode).toBe(403);
        expect(error?.code).toBe('SIN_PERMISO');
        expect(siguiente).not.toHaveBeenCalled();
    });

    it('con un rol permitido deja pasar', () => {
        const siguiente = vi.fn();
        requireRol('super_admin')(peticion('super_admin'), respuesta, siguiente);
        expect(siguiente).toHaveBeenCalledOnce();
    });

    it('acepta cualquiera de varios roles', () => {
        const siguiente = vi.fn();
        requireRol('super_admin', 'admin')(peticion('admin'), respuesta, siguiente);
        expect(siguiente).toHaveBeenCalledOnce();
    });

    it('si no se indica ningun rol, nadie pasa', () => {
        const siguiente = vi.fn();
        const error = capturar(() => requireRol()(peticion('super_admin'), respuesta, siguiente));
        expect(error?.statusCode).toBe(403);
        expect(siguiente).not.toHaveBeenCalled();
    });
});