import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { env } from '../../src/config/env';
import { generarToken, hashToken } from '../../src/utils/emailToken';
import { hashPassword, verifyPassword } from '../../src/utils/password';
import { firmarSesion, verificarSesion } from '../../src/utils/token';

describe('contrasenas (argon2id)', () => {
    it('guarda un hash argon2id, nunca la contrasena en claro', async () => {
        const hash = await hashPassword('ClaveSegura123');
        expect(hash.startsWith('$argon2id$')).toBe(true);
        expect(hash).not.toContain('ClaveSegura123');
    });

    it('acepta la contrasena correcta y rechaza la incorrecta', async () => {
        const hash = await hashPassword('ClaveSegura123');
        expect(await verifyPassword(hash, 'ClaveSegura123')).toBe(true);
        expect(await verifyPassword(hash, 'claveSegura123')).toBe(false);
    });

    it('la misma contrasena genera hashes distintos (sal aleatoria)', async () => {
        const [a, b] = await Promise.all([hashPassword('ClaveSegura123'), hashPassword('ClaveSegura123')]);
        expect(a).not.toBe(b);
    });

    it('un hash corrupto da false, no lanza error', async () => {
        expect(await verifyPassword('esto-no-es-un-hash', 'cualquiera')).toBe(false);
    });
});

describe('token de sesion (JWT)', () => {
    it('firma y verifica: devuelve el id y cuando se emitio', () => {
        const sesion = verificarSesion(firmarSesion(7));
        expect(sesion?.id).toBe(7);
        expect(typeof sesion?.emitidoEn).toBe('number');
    });

    it('rechaza basura', () => {
        expect(verificarSesion('')).toBeNull();
        expect(verificarSesion('no.es.un.token')).toBeNull();
    });

    it('rechaza un token manipulado', () => {
        const token = firmarSesion(7);
        const manipulado = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
        expect(verificarSesion(manipulado)).toBeNull();
    });

    it('rechaza un token firmado con otro secreto', () => {
        const falso = jwt.sign({}, 'otro-secreto-de-prueba-que-no-es-el-real-123456', {
            subject: '7',
            issuer: 'api-turismo',
            expiresIn: 60,
        });
        expect(verificarSesion(falso)).toBeNull();
    });

    it('rechaza un token expirado', () => {
        const vencido = jwt.sign({}, env.JWT_SECRET, { subject: '7', issuer: 'api-turismo', expiresIn: -10 });
        expect(verificarSesion(vencido)).toBeNull();
    });

    it('rechaza un token de otro emisor', () => {
        const ajeno = jwt.sign({}, env.JWT_SECRET, { subject: '7', issuer: 'otra-api', expiresIn: 60 });
        expect(verificarSesion(ajeno)).toBeNull();
    });

    it('rechaza un token sin firma (alg none)', () => {
        const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const cuerpo = Buffer.from(JSON.stringify({ sub: '7', iss: 'api-turismo' })).toString('base64url');
        expect(verificarSesion(`${cabecera}.${cuerpo}.`)).toBeNull();
    });
});

describe('tokens de correo', () => {
    it('son largos, aptos para URL y no se repiten', () => {
        const tokens = new Set(Array.from({ length: 200 }, () => generarToken()));
        expect(tokens.size).toBe(200);
        for (const t of tokens) {
            expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
        }
    });

    it('hashToken es SHA-256 estable y no devuelve el token', () => {
        expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(hashToken('abc')).toBe(hashToken('abc'));
        expect(hashToken('abc')).not.toBe(hashToken('abd'));
    });
});