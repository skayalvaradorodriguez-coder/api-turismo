import { Router } from 'express';
import { pool } from '../config/db';
import { isProd } from '../config/env';
import { authRouter } from '../modules/auth/auth.routes';
import { recuperacionRouter } from '../modules/auth/recuperacion.routes';
import { registroRouter } from '../modules/auth/registro.routes';
import { googleRouter } from '../modules/auth/google.routes';
import { fuentesRouter } from '../modules/fuentes/fuentes.routes';
import { cargasRouter } from '../modules/cargas/cargas.routes';
import { procesamientoRouter } from '../modules/procesamiento/procesamiento.routes';
import { indicadoresRouter } from '../modules/indicadores/indicadores.routes';
import { usuariosRouter } from '../modules/usuarios/usuarios.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'api-turismo',
        timestamp: new Date().toISOString(),
    });
});

// Solo para desarrollo: comprueba la conexion a MySQL y que las tablas existan
if (!isProd) {
    apiRouter.get('/health/db', async (_req, res) => {
        const [rows] = await pool.query('SELECT COUNT(*) AS roles FROM roles');
        res.json({ ok: true, db: 'conectada', ...(rows as Array<Record<string, unknown>>)[0] });
    });
}

apiRouter.use('/auth', authRouter);
apiRouter.use('/auth', registroRouter);
apiRouter.use('/auth', recuperacionRouter);
apiRouter.use('/auth', googleRouter);
apiRouter.use('/fuentes', fuentesRouter);
apiRouter.use('/cargas', cargasRouter);
apiRouter.use('/cargas', procesamientoRouter);
apiRouter.use('/cargas', indicadoresRouter);
apiRouter.use('/usuarios', usuariosRouter);

