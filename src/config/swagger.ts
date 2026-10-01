import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '../docs/registry';
import { env } from './env';
import { logger } from '../common/logger';

/** Mount Swagger UI + the raw OpenAPI JSON (PLAN.md §3.5). */
export function mountSwagger(app: Express): void {
  if (!env.SWAGGER_ENABLED) return;

  const document = buildOpenApiDocument(env.API_PREFIX);

  app.get('/api/docs.json', (_req, res) => {
    res.json(document);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(document, { customSiteTitle: 'EMS API Docs' }),
  );

  logger.info('Swagger UI mounted at /api/docs (spec at /api/docs.json)');
}
