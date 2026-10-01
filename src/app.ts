import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import { apiRouter } from './routes';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());

// CORS: solo el frontend autorizado, y con cookies (credentials)
app.use(
    cors({
        origin: env.FRONTEND_URL,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type'],
    }),
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api/v1', apiRouter);

app.use(notFound);
app.use(errorHandler);