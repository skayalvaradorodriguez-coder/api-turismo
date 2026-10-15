import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/transaccion', () => ({
    enTransaccion: (trabajo: (conexion: unknown) => Promise<unknown>) => trabajo({ conexion: 'falsa' }),
}));
vi.mock('../../src/modules/auditoria/auditoria.service', () => ({ registrar: vi.fn() }));
vi.mock('../../src/modules/usuarios/usuarios.repository', () => ({
    buscarUsuario: vi.fn(),
    listarUsuarios: vi.fn(),
    bloquearUsuario: vi.fn(),
    buscarRolPorCodigo: vi.fn(),
    cambiarRol: vi.fn(),
    cambiarActivo: vi.fn(),
    invalidarSesiones: vi.fn(),
}));

import { registrar } from '../../src/modules/auditoria/auditoria.service';
import * as repo from '../../src/modules/usuarios/usuarios.repository';
import type { UsuarioGestion } from '../../src/modules/usuarios/usuarios.repository';
import { cambiarEstado, cambiarRol, listarUsuarios, obtenerUsuario } from '../../src/modules/usuarios/usuarios.service';

const SUPER = 1;
const ADMIN = 2;
const INVESTIGADOR = 3;
const EXTERNO = 4;
const OTRO_EXTERNO = 5;
const OTRO_ADMIN = 6;

const IDS_ROL: Record<string, number> = { super_admin: 1, externo: 2, admin: 3, investigador: 4 };
const CONEXION = { conexion: 'falsa' };

function persona(id: number, rol: string, activo = true): UsuarioGestion {
    return { id, nombres: 'Prueba', apellidos: rol, email: `${id}@example.com`, rol, activo, emailVerificado: true, ultimoLoginEn: null, creadoEn: new Date('2026-10-01T00:00:00Z') };
}

/** Deja en la "base" simulada a estas personas: se pueden leer y bloquear. */
function conPersonas(...lista: UsuarioGestion[]): void {
    vi.mocked(repo.buscarUsuario).mockImplementation(async (id) => {
        const p = lista.find((x) => x.id === id);
        return p ? { ...p } : null;
    });
    vi.mocked(repo.bloquearUsuario).mockImplementation(async (id) => {
        const p = lista.find((x) => x.id === id);
        return p ? { id: p.id, rolId: IDS_ROL[p.rol] ?? 0, rol: p.rol, activo: p.activo } : null;
    });
}

const actorDe = (id: number) => ({ id, ip: '10.0.0.7' });

const TODAS = [persona(SUPER, 'super_admin'), persona(ADMIN, 'admin'), persona(OTRO_ADMIN, 'admin'), persona(INVESTIGADOR, 'investigador'), persona(EXTERNO, 'externo'), persona(OTRO_EXTERNO, 'externo')];

beforeEach(() => {
    vi.resetAllMocks();
    conPersonas(...TODAS);
    vi.mocked(repo.buscarRolPorCodigo).mockImplementation(async (codigo) => (IDS_ROL[codigo] ? { id: IDS_ROL[codigo], codigo } : null));
    vi.mocked(repo.cambiarRol).mockResolvedValue(true);
    vi.mocked(repo.cambiarActivo).mockResolvedValue(true);
});

describe('usuarios.service: consultas', () => {
    it('lista con el filtro recibido', async () => {
        vi.mocked(repo.listarUsuarios).mockResolvedValue({ usuarios: [], total: 0 });
        const filtro = { rol: 'externo', limite: 20, pagina: 2 };
        expect(await listarUsuarios(filtro)).toEqual({ usuarios: [], total: 0 });
        expect(repo.listarUsuarios).toHaveBeenCalledWith(filtro);
    });

    it('obtiene una cuenta o responde 404', async () => {
        expect((await obtenerUsuario(EXTERNO)).id).toBe(EXTERNO);
        await expect(obtenerUsuario(999)).rejects.toMatchObject({ statusCode: 404, code: 'USUARIO_NO_ENCONTRADO' });
    });
});

describe('usuarios.service: cambiar rol', () => {
    it('un admin sube a un externo a investigador y queda en la bitacora', async () => {
        const res = await cambiarRol(EXTERNO, 'investigador', actorDe(ADMIN));

        expect(res.id).toBe(EXTERNO);
        expect(repo.cambiarRol).toHaveBeenCalledWith(EXTERNO, IDS_ROL['investigador'], CONEXION);
        expect(registrar).toHaveBeenCalledWith(
            { usuarioId: ADMIN, accion: 'usuario.cambiar_rol', entidad: 'usuario', entidadId: EXTERNO, detalle: { rolAnterior: 'externo', rolNuevo: 'investigador' }, ip: '10.0.0.7' },
            CONEXION,
        );
    });

    it('un admin baja a un investigador a externo', async () => {
        await cambiarRol(INVESTIGADOR, 'externo', actorDe(ADMIN));
        expect(repo.cambiarRol).toHaveBeenCalledWith(INVESTIGADOR, IDS_ROL['externo'], CONEXION);
    });

    it('un super_admin asigna y quita el rol de admin', async () => {
        await cambiarRol(EXTERNO, 'admin', actorDe(SUPER));
        expect(repo.cambiarRol).toHaveBeenLastCalledWith(EXTERNO, IDS_ROL['admin'], CONEXION);

        await cambiarRol(OTRO_ADMIN, 'externo', actorDe(SUPER));
        expect(repo.cambiarRol).toHaveBeenLastCalledWith(OTRO_ADMIN, IDS_ROL['externo'], CONEXION);
        expect(registrar).toHaveBeenCalledTimes(2);
    });

    it('un admin NO puede asignar el rol de admin', async () => {
        await expect(cambiarRol(EXTERNO, 'admin', actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 403, code: 'PERMISO_INSUFICIENTE' });
        expect(repo.cambiarRol).not.toHaveBeenCalled();
        expect(registrar).not.toHaveBeenCalled();
    });

    it('un admin NO puede quitarle el rol a otro admin', async () => {
        await expect(cambiarRol(OTRO_ADMIN, 'externo', actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 403, code: 'PERMISO_INSUFICIENTE' });
        expect(repo.cambiarRol).not.toHaveBeenCalled();
    });

    it('nadie cambia su propio rol, ni siquiera un super_admin', async () => {
        for (const quien of [ADMIN, SUPER]) {
            await expect(cambiarRol(quien, 'externo', actorDe(quien))).rejects.toMatchObject({ statusCode: 403, code: 'CUENTA_PROPIA' });
        }
        expect(repo.cambiarRol).not.toHaveBeenCalled();
    });

    it('la cuenta de un super_admin no se modifica, ni siquiera por otro super_admin', async () => {
        conPersonas(...TODAS, persona(7, 'super_admin'));
        await expect(cambiarRol(7, 'externo', actorDe(SUPER))).rejects.toMatchObject({ statusCode: 403, code: 'SUPER_ADMIN_PROTEGIDO' });
        await expect(cambiarRol(SUPER, 'externo', actorDe(ADMIN))).rejects.toMatchObject({ code: 'SUPER_ADMIN_PROTEGIDO' });
        expect(repo.cambiarRol).not.toHaveBeenCalled();
    });

    it('si ya tiene ese rol responde 409 y no escribe nada', async () => {
        await expect(cambiarRol(EXTERNO, 'externo', actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 409, code: 'ROL_SIN_CAMBIOS' });
        expect(registrar).not.toHaveBeenCalled();
    });

    it('si la cuenta no existe responde 404', async () => {
        await expect(cambiarRol(999, 'externo', actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 404, code: 'USUARIO_NO_ENCONTRADO' });
    });

    it.each([
        ['un investigador', INVESTIGADOR],
        ['un externo', EXTERNO],
        ['una cuenta que no existe', 999],
    ])('%s no puede cambiar roles (se revisa en la base, no solo en la sesion)', async (_nombre, quien) => {
        await expect(cambiarRol(OTRO_EXTERNO, 'investigador', actorDe(quien))).rejects.toMatchObject({ statusCode: 403, code: 'PERMISO_INSUFICIENTE' });
        expect(repo.bloquearUsuario).not.toHaveBeenCalled();
    });

    it('un admin desactivado ya no puede cambiar roles', async () => {
        conPersonas(...TODAS.filter((p) => p.id !== ADMIN), persona(ADMIN, 'admin', false));
        await expect(cambiarRol(EXTERNO, 'investigador', actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 403 });
    });

    it('si el rol no esta en la base avisa que falta ejecutar la migracion', async () => {
        vi.mocked(repo.buscarRolPorCodigo).mockResolvedValue(null);
        await expect(cambiarRol(EXTERNO, 'investigador', actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 500, code: 'ROL_NO_CONFIGURADO' });
    });

    it('si la bitacora falla el error sale (la transaccion real deshace el cambio)', async () => {
        vi.mocked(registrar).mockRejectedValue(new Error('fallo de bitacora'));
        await expect(cambiarRol(EXTERNO, 'investigador', actorDe(ADMIN))).rejects.toThrow('fallo de bitacora');
    });
});

describe('usuarios.service: activar y desactivar', () => {
    it('un admin desactiva a un externo: cierra sus sesiones y queda en la bitacora', async () => {
        await cambiarEstado(EXTERNO, false, actorDe(ADMIN));

        expect(repo.cambiarActivo).toHaveBeenCalledWith(EXTERNO, false, CONEXION);
        expect(repo.invalidarSesiones).toHaveBeenCalledWith(EXTERNO, CONEXION);
        expect(registrar).toHaveBeenCalledWith(
            { usuarioId: ADMIN, accion: 'usuario.desactivar', entidad: 'usuario', entidadId: EXTERNO, detalle: { rol: 'externo' }, ip: '10.0.0.7' },
            CONEXION,
        );
    });

    it('al reactivar no toca las sesiones y lo anota como activar', async () => {
        conPersonas(...TODAS.filter((p) => p.id !== EXTERNO), persona(EXTERNO, 'externo', false));
        await cambiarEstado(EXTERNO, true, actorDe(ADMIN));

        expect(repo.cambiarActivo).toHaveBeenCalledWith(EXTERNO, true, CONEXION);
        expect(repo.invalidarSesiones).not.toHaveBeenCalled();
        expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ accion: 'usuario.activar' }), CONEXION);
    });

    it('un admin NO puede desactivar a otro admin, pero un super_admin si', async () => {
        await expect(cambiarEstado(OTRO_ADMIN, false, actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 403, code: 'PERMISO_INSUFICIENTE' });
        expect(repo.cambiarActivo).not.toHaveBeenCalled();

        await cambiarEstado(OTRO_ADMIN, false, actorDe(SUPER));
        expect(repo.cambiarActivo).toHaveBeenCalledWith(OTRO_ADMIN, false, CONEXION);
    });

    it('nadie se desactiva a si mismo', async () => {
        await expect(cambiarEstado(ADMIN, false, actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 403, code: 'CUENTA_PROPIA' });
    });

    it('la cuenta de un super_admin no se desactiva', async () => {
        await expect(cambiarEstado(SUPER, false, actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 403, code: 'SUPER_ADMIN_PROTEGIDO' });
        expect(repo.cambiarActivo).not.toHaveBeenCalled();
    });

    it('si ya esta en ese estado responde 409', async () => {
        await expect(cambiarEstado(EXTERNO, true, actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 409, code: 'ESTADO_SIN_CAMBIOS' });
        expect(registrar).not.toHaveBeenCalled();
    });

    it('si la cuenta no existe responde 404', async () => {
        await expect(cambiarEstado(999, false, actorDe(ADMIN))).rejects.toMatchObject({ statusCode: 404 });
    });

    it('un investigador no puede desactivar cuentas', async () => {
        await expect(cambiarEstado(EXTERNO, false, actorDe(INVESTIGADOR))).rejects.toMatchObject({ statusCode: 403, code: 'PERMISO_INSUFICIENTE' });
        expect(repo.bloquearUsuario).not.toHaveBeenCalled();
    });
});
