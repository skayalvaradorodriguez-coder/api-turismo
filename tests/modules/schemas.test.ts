import { describe, expect, it } from 'vitest';
import { generarToken } from '../../src/utils/emailToken';
import { passwordNueva, registroSchema, verificarSchema } from '../../src/modules/auth/registro.schemas';

const valido = {
    nombres: 'Ana María',
    apellidos: "O'Brien-Pérez",
    email: '  ANA@Correo.com ',
    password: 'ClaveSegura123',
};

describe('registroSchema', () => {
    it('acepta datos validos y normaliza el correo', () => {
        const r = registroSchema.safeParse(valido);
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.email).toBe('ana@correo.com');
    });

    it('rechaza campos vacios', () => {
        expect(registroSchema.safeParse({}).success).toBe(false);
    });

    it('rechaza correos invalidos', () => {
        expect(registroSchema.safeParse({ ...valido, email: 'no-es-correo' }).success).toBe(false);
    });

    it('rechaza nombres con numeros o simbolos (incluye intento de inyeccion)', () => {
        expect(registroSchema.safeParse({ ...valido, nombres: 'Ana123' }).success).toBe(false);
        expect(registroSchema.safeParse({ ...valido, nombres: "Robert'); DROP TABLE usuarios;--" }).success).toBe(false);
    });

    it('rechaza una contrasena igual al correo', () => {
        const r = registroSchema.safeParse({ ...valido, email: 'Abcdefghij1@correo.com', password: 'Abcdefghij1@correo.com' });
        expect(r.success).toBe(false);
    });
});

describe('passwordNueva', () => {
    it.each([
        ['muy corta', 'Abc12345'],
        ['sin mayuscula', 'clavesegura123'],
        ['sin minuscula', 'CLAVESEGURA123'],
        ['sin numero', 'ClaveSeguraSinNumero'],
        ['demasiado larga', 'Aa1' + 'x'.repeat(130)],
    ])('rechaza contrasena %s', (_motivo, password) => {
        expect(passwordNueva.safeParse(password).success).toBe(false);
    });

    it('acepta una contrasena que cumple la politica', () => {
        expect(passwordNueva.safeParse('ClaveSegura123').success).toBe(true);
    });
});

describe('verificarSchema (token del enlace)', () => {
    it('acepta un token generado por la API', () => {
        expect(verificarSchema.safeParse({ token: generarToken() }).success).toBe(true);
    });

    it('rechaza tokens cortos o con caracteres raros', () => {
        expect(verificarSchema.safeParse({ token: 'corto' }).success).toBe(false);
        expect(verificarSchema.safeParse({ token: "' OR 1=1 --" + 'a'.repeat(30) }).success).toBe(false);
        expect(verificarSchema.safeParse({}).success).toBe(false);
    });
});