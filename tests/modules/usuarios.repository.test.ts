import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/config/db';
import {
    bloquearUsuario,
    buscarRolPorCodigo,
    buscarUsuario,
    cambiarActivo,
    cambiarRol,
    invalidarSesiones,
    listarUsuarios,
} from '../../src/modules/usuarios/usuarios.repository';

let conexion: PoolConnection;
let marca: string;

// Cada prueba trabaja dentro de una transaccion que se deshace al final: no queda nada en la base
beforeEach(async () => {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    marca = randomUUID().slice(0, 8);
});

afterEach(async () => {
    await conexion.rollback();
    conexion.release();
});

afterAll(async () => {
    await pool.end();
});

interface DatosUsuario {
    nombres?: string;
    apellidos?: string;
    email?: string;
    rol?: string;
    activo?: boolean;
    verificado?: boolean;
}

async function crearUsuario(datos: DatosUsuario = {}): Promise<number> {
    const [r] = await conexion.execute<ResultSetHeader>(
        `INSERT INTO usuarios (nombres, apellidos, email, password_hash, rol_id, activo, email_verificado_at)
         SELECT ?, ?, ?, 'hash-de-prueba', r.id, ?, ${datos.verificado ? 'NOW()' : 'NULL'}
           FROM roles r WHERE r.codigo = ?`,
        [
            datos.nombres ?? `Prueba ${marca}`,
            datos.apellidos ?? 'Apellido',
            datos.email ?? `${randomUUID()}@example.com`,
            datos.activo === false ? 0 : 1,
            datos.rol ?? 'externo',
        ],
    );
    return r.insertId;
}

const buscar = (texto: string, extra: object = {}) => listarUsuarios({ texto, limite: 50, pagina: 1, ...extra }, conexion);

describe('usuarios.repository: lectura', () => {
    it('lee una cuenta con su rol, sin ningun dato de credenciales', async () => {
        const id = await crearUsuario({ nombres: 'Ana', apellidos: 'Lopez', email: `ana.${marca}@example.com`, rol: 'investigador', verificado: true });
        const u = await buscarUsuario(id, conexion);

        expect(u).toMatchObject({ id, nombres: 'Ana', apellidos: 'Lopez', email: `ana.${marca}@example.com`, rol: 'investigador', activo: true, emailVerificado: true, ultimoLoginEn: null });
        expect(u?.creadoEn).toBeInstanceOf(Date);
        expect(Object.keys(u ?? {}).sort()).toEqual(['activo', 'apellidos', 'creadoEn', 'email', 'emailVerificado', 'id', 'nombres', 'rol', 'ultimoLoginEn']);
    });

    it('una cuenta sin verificar y una desactivada se reflejan bien', async () => {
        const id = await crearUsuario({ activo: false, verificado: false });
        expect(await buscarUsuario(id, conexion)).toMatchObject({ activo: false, emailVerificado: false });
    });

    it('devuelve null si la cuenta no existe', async () => {
        expect(await buscarUsuario(999999999, conexion)).toBeNull();
    });

    it('lista filtrando por rol, por estado y por texto', async () => {
        await crearUsuario({ rol: 'externo' });
        await crearUsuario({ rol: 'investigador' });
        await crearUsuario({ rol: 'investigador', activo: false });

        expect((await buscar(marca)).total).toBe(3);
        expect((await buscar(marca, { rol: 'investigador' })).total).toBe(2);
        expect((await buscar(marca, { activo: false })).total).toBe(1);
        expect((await buscar(marca, { rol: 'investigador', activo: true })).total).toBe(1);
        expect((await buscar(marca, { rol: 'admin' })).total).toBe(0);
    });

    it('busca por nombre, apellido o correo sin distinguir mayusculas ni tildes', async () => {
        await crearUsuario({ nombres: `María ${marca}`, apellidos: 'Pérez', email: `mp.${marca}@example.com` });

        expect((await buscar(`maria ${marca}`)).total).toBe(1);
        expect((await buscar('PEREZ')).usuarios.some((u) => u.email === `mp.${marca}@example.com`)).toBe(true);
        expect((await buscar(`MP.${marca}`)).total).toBe(1);
    });

    it('% y _ del texto buscado no funcionan como comodines', async () => {
        await crearUsuario({ apellidos: `100%${marca}` });
        await crearUsuario({ apellidos: `1000${marca}` });

        expect((await buscar(`100%${marca}`)).total).toBe(1);
        expect((await buscar(`10_0${marca}`)).total).toBe(0);
    });

    it('trata comillas y sentencias SQL como simple texto', async () => {
        const id = await crearUsuario({ apellidos: "x'; DROP TABLE usuarios; --" });
        expect((await buscar("x'; DROP TABLE usuarios; --")).usuarios.map((u) => u.id)).toEqual([id]);
        expect(await buscarUsuario(id, conexion)).not.toBeNull();
    });

    it('pagina, ordena del mas reciente al mas antiguo y cuenta el total', async () => {
        const ids = [await crearUsuario(), await crearUsuario(), await crearUsuario(), await crearUsuario(), await crearUsuario()];

        const p1 = await buscar(marca, { limite: 2, pagina: 1 });
        const p3 = await buscar(marca, { limite: 2, pagina: 3 });
        expect(p1.total).toBe(5);
        expect(p1.usuarios.map((u) => u.id)).toEqual([ids[4], ids[3]]);
        expect(p3.usuarios.map((u) => u.id)).toEqual([ids[0]]);
    });

    it('acota un limite fuera de rango', async () => {
        await crearUsuario();
        expect((await buscar(marca, { limite: 0 })).usuarios).toHaveLength(1);
        expect((await buscar(marca, { limite: 100000 })).usuarios).toHaveLength(1);
    });

    it('encuentra los cuatro roles definitivos', async () => {
        for (const codigo of ['super_admin', 'admin', 'investigador', 'externo']) {
            expect(await buscarRolPorCodigo(codigo, conexion)).toMatchObject({ codigo });
        }
        expect(await buscarRolPorCodigo('usuario', conexion)).toBeNull();
        expect(await buscarRolPorCodigo('inventado', conexion)).toBeNull();
    });
});

describe('usuarios.repository: cambios', () => {
    it('bloquearUsuario devuelve rol y estado, y null si no existe', async () => {
        const id = await crearUsuario({ rol: 'admin', activo: false });
        const rol = await buscarRolPorCodigo('admin', conexion);
        expect(await bloquearUsuario(id, conexion)).toEqual({ id, rolId: rol?.id, rol: 'admin', activo: false });
        expect(await bloquearUsuario(999999999, conexion)).toBeNull();
    });

    it('cambia el rol y solo el rol', async () => {
        const id = await crearUsuario({ nombres: 'Luis', rol: 'externo' });
        const rol = await buscarRolPorCodigo('investigador', conexion);

        expect(await cambiarRol(id, rol?.id ?? 0, conexion)).toBe(true);
        expect(await buscarUsuario(id, conexion)).toMatchObject({ nombres: 'Luis', rol: 'investigador', activo: true });
        expect(await cambiarRol(999999999, rol?.id ?? 0, conexion)).toBe(false);
    });

    it('la base rechaza un rol que no existe', async () => {
        const id = await crearUsuario();
        await expect(cambiarRol(id, 99, conexion)).rejects.toThrow();
    });

    it('desactiva y reactiva una cuenta', async () => {
        const id = await crearUsuario();

        expect(await cambiarActivo(id, false, conexion)).toBe(true);
        expect((await buscarUsuario(id, conexion))?.activo).toBe(false);
        expect(await cambiarActivo(id, true, conexion)).toBe(true);
        expect((await buscarUsuario(id, conexion))?.activo).toBe(true);
        expect(await cambiarActivo(999999999, false, conexion)).toBe(false);
    });

    it('invalidarSesiones marca el momento a partir del cual valen las sesiones', async () => {
        const id = await crearUsuario();
        const leer = async () => {
            const [filas] = await conexion.query<RowDataPacket[]>('SELECT sesiones_validas_desde AS d FROM usuarios WHERE id = ?', [id]);
            return filas[0]?.['d'];
        };

        expect(await leer()).toBeNull();
        await invalidarSesiones(id, conexion);
        expect(await leer()).toBeInstanceOf(Date);
    });
});
