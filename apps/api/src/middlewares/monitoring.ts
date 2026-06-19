import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Coleta métricas padrão (CPU, Memória)
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Métrica personalizada: Tempo de Resposta
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const monitoringMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    end({
      method: req.method,
      route: route,
      status_code: res.statusCode.toString(),
    });
  });
  next();
};

export const metricsEndpoint = async (req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};