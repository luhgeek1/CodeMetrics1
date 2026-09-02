import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthTransport } from './auth.transport.js';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly transport: AuthTransport) {}
  @Post('register')
  register(
    @Body() input: unknown,
    @Headers('x-client') source: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.transport.credentials('register', input, source, req, res);
  }
  @Post('login')
  @HttpCode(200)
  login(
    @Body() input: unknown,
    @Headers('x-client') source: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.transport.credentials('login', input, source, req, res);
  }
  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.transport.refresh(req, res);
  }
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.transport.logout(req, res);
    return { message: 'Logged out successfully' };
  }
}
