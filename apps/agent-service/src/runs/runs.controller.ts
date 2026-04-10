import {
  Controller,
  Post,
  Body,
  Headers,
  Res,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RunResponse } from '@repo/agent-contracts';
import { RunsService } from './runs.service.js';

@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

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
