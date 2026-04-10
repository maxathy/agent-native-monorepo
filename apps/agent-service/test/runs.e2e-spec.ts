import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe.js';
import { RunRequestSchema } from '@repo/agent-contracts';

describe('RunsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe(RunRequestSchema));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
      expect(response.body).toHaveProperty('runId');
      expect(response.body).toHaveProperty('outcome');
      expect(response.body).toHaveProperty('tokenCounts');
      expect(response.body.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
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
