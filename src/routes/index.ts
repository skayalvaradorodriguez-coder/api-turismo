import { Router } from 'express';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'api-turismo',
        timestamp: new Date().toISOString(),
    });
});