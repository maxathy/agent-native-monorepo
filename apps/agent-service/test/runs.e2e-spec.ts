import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe.js';
import { RunRequestSchema, RunResponseSchema } from '@repo/agent-contracts';

describe('RunsController (e2e)', () => {
  let app: INestApplication;
  let savedApiKey: string | undefined;
  let savedDatabaseUrl: string | undefined;
  let savedNeo4jUri: string | undefined;

  beforeAll(async () => {
    // RunsService.getDeps() reads GOOGLE_API_KEY at request time and switches to
    // live Gemini calls when it is set. The README tells every reader to put one
    // in .env, so without this the suite reaches the network and fails on
    // whatever the model catalogue looks like that day. This suite covers the
    // HTTP surface and graph wiring, so it pins the stub dependency set.
    savedApiKey = process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];

    // Memory is a second, independent axis: DATABASE_URL and NEO4J_URI select
    // the real adapters, the migrations and the checkpointer. A developer with
    // those in their environment would otherwise boot this suite against
    // databases it does not provide, and the service is built to fail loudly
    // rather than fall back to stubs when a configured store is unreachable.
    savedDatabaseUrl = process.env['DATABASE_URL'];
    savedNeo4jUri = process.env['NEO4J_URI'];
    delete process.env['DATABASE_URL'];
    delete process.env['NEO4J_URI'];

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe(RunRequestSchema));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (savedApiKey !== undefined) process.env['GOOGLE_API_KEY'] = savedApiKey;
    if (savedDatabaseUrl !== undefined) process.env['DATABASE_URL'] = savedDatabaseUrl;
    if (savedNeo4jUri !== undefined) process.env['NEO4J_URI'] = savedNeo4jUri;
  });

  describe('POST /runs', () => {
    it('returns 200 with a valid RunResponse', async () => {
      const response = await request(app.getHttpServer())
        .post('/runs')
        .set('Content-Type', 'application/json')
        .set('x-correlation-id', 'test-corr-001')
        .send({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          messages: [{ role: 'user', content: 'What is LangGraph?' }],
        });

      expect(response.status).toBe(HttpStatus.OK);
      expect(() => RunResponseSchema.parse(response.body)).not.toThrow();
      expect(response.body.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('mints a correlation id when the header is absent', async () => {
      // The gateway mints one, so the README quickstart never hits this. A
      // direct caller of port 3000 did, and got a 500: the controller bound
      // undefined and seedWorkingMemory's Zod parse threw.
      const response = await request(app.getHttpServer())
        .post('/runs')
        .set('Content-Type', 'application/json')
        .send({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          messages: [{ role: 'user', content: 'What is LangGraph?' }],
        });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.headers['x-correlation-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('returns 400 for invalid request body', async () => {
      const response = await request(app.getHttpServer())
        .post('/runs')
        .set('Content-Type', 'application/json')
        .send({ sessionId: 'not-a-uuid', messages: [] });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body).toHaveProperty('issues');
    });
  });

  describe('POST /runs/stream', () => {
    it('returns text/event-stream content type', async () => {
      const response = await request(app.getHttpServer())
        .post('/runs/stream')
        .set('Content-Type', 'application/json')
        .set('x-correlation-id', 'test-corr-002')
        .send({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          messages: [{ role: 'user', content: 'What is LangGraph?' }],
        });

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.text).toContain('data:');
    });
  });
});
