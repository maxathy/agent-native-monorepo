import { Controller, Post, Body, Headers, Res, HttpCode, Inject } from '@nestjs/common';
import type { Response } from 'express';
import type { RunResponse } from '@repo/agent-contracts';
import { RunsService } from './runs.service.js';

@Controller('runs')
export class RunsController {
  // The token is explicit because `yarn dev` runs through tsx, and esbuild does
  // not implement emitDecoratorMetadata. Without it Nest has no design:paramtypes
  // to resolve, injects undefined, and every request fails with "Cannot read
  // properties of undefined (reading 'execute')" — on the compiled path only,
  // where tsc does emit the metadata, so it works. This is the sole DI site.
  constructor(@Inject(RunsService) private readonly runsService: RunsService) {}

  @Post()
  @HttpCode(200)
  async createRun(
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<RunResponse> {
    return this.runsService.execute({ body, correlationId });
  }

  @Post('stream')
  async streamRun(
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId: string,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    await this.runsService.stream({ body, correlationId, res });
  }
}
