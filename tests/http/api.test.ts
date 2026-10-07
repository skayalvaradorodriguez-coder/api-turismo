import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';

describe('API: proteccion y cabeceras (sin tocar la base de datos)', () => {
    it('/auth/me sin cookie responde 401', async () => {
        const r = await request(app).get('/api/v1/auth/me');
        expect(r.status).toBe(401);
    });

    it('/auth/me con una cookie falsa responde 401', async () => {
        const r = await request(app).get('/api/v1/auth/me').set('Cookie', 'wt_session=token.falso.aqui');
        expect(r.status).toBe(401);
    });

    it('una ruta que no existe responde 404', async () => {
        const r = await request(app).get('/api/v1/no-existe');
        expect(r.status).toBe(404);
    });

    it('login con cuerpo vacio es rechazado por validacion (no llega a la base de datos)', async () => {
        const r = await request(app).post('/api/v1/auth/login').send({});
        expect([400, 422]).toContain(r.status);
    });

    it('registro con datos invalidos es rechazado por validacion', async () => {
        const r = await request(app)
            .post('/api/v1/auth/registro')
            .send({ nombres: 'A', apellidos: '1', email: 'x', password: '123' });
        expect([400, 422]).toContain(r.status);
    });

    it('las respuestas de error no filtran la traza interna', async () => {
        const r = await request(app).get('/api/v1/auth/me');
        expect(JSON.stringify(r.body)).not.toMatch(/stack|node_modules|at .*\(/i);
    });

    it('no anuncia Express y trae cabeceras de seguridad de helmet', async () => {
        const r = await request(app).get('/api/v1/auth/me');
        expect(r.headers['x-powered-by']).toBeUndefined();
        expect(r.headers['x-content-type-options']).toBe('nosniff');
    });

    it('CORS: solo autoriza al frontend configurado, nunca a un sitio ajeno', async () => {
        const bueno = await request(app).get('/api/v1/auth/me').set('Origin', 'http://localhost:4200');
        expect(bueno.headers['access-control-allow-origin']).toBe('http://localhost:4200');
        expect(bueno.headers['access-control-allow-credentials']).toBe('true');

        // La API nunca "refleja" el origen del atacante: siempre responde con el frontend autorizado,
        // asi que el navegador bloquea la lectura desde sitios ajenos.
        const malo = await request(app).get('/api/v1/auth/me').set('Origin', 'https://sitio-malicioso.example');
        expect(malo.headers['access-control-allow-origin']).not.toBe('https://sitio-malicioso.example');
        expect(malo.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    });
});