import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../../common/validation.js';
import { Environment } from '../../config/environment.js';
import { TokenPair } from '../../generated/graphql.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class AuthTransport {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async credentials(
    kind: 'register' | 'login',
    input: unknown,
    source: unknown,
    req: Request,
    res: Response,
  ): Promise<TokenPair> {
    await this.auth.throttle(req.ip ?? 'unknown');
    const client = parse(z.enum(['web', 'mobile']).default('web'), source);
    return this.respond(await this.auth[kind](input, client), res);
  }

  async refresh(
    req: Request,
    res: Response,
    token?: string | null,
    csrf?: string | null,
  ) {
    await this.auth.throttle(req.ip ?? 'unknown');
    const cookie = this.cookie(req, 'refresh_token');
    const value =
      cookie ?? token ?? req.headers.authorization?.replace(/^Bearer /i, '');
    const headerCsrf = csrf ?? req.header('X-CSRF-Token');
    if (!value) throw new UnauthorizedException('Missing refresh token');
    if (cookie && !headerCsrf)
      throw new ForbiddenException('Missing CSRF token');
    try {
      return this.respond(await this.auth.refresh(value, headerCsrf), res);
    } catch (error) {
      this.clearCookies(res);
      throw error;
    }
  }

  async logout(req: Request, res: Response, token?: string | null) {
    await this.auth.throttle(req.ip ?? 'unknown');
    const value =
      this.cookie(req, 'refresh_token') ??
      token ??
      req.headers.authorization?.replace(/^Bearer /i, '');
    if (!value) throw new UnauthorizedException('Refresh token is not passed');
    await this.auth.logout(value);
    this.clearCookies(res);
    return true;
  }

  private cookie(req: Request, name: string): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    return typeof cookies?.[name] === 'string' ? cookies[name] : undefined;
  }

  private respond(
    tokens: Awaited<ReturnType<AuthService['login']>>,
    res: Response,
  ): TokenPair {
    if (tokens.source === 'web') {
      const options = {
        secure: this.config.get('COOKIE_SECURE'),
        sameSite: this.config.get('COOKIE_SECURE')
          ? ('none' as const)
          : ('lax' as const),
        path: '/',
        maxAge: this.config.get('REFRESH_TTL') * 1000,
      };
      res.cookie('refresh_token', tokens.refresh, {
        ...options,
        httpOnly: true,
      });
      res.cookie('csrf_token', tokens.csrf, { ...options, httpOnly: false });
    }
    return {
      access_token: tokens.access,
      refresh_token: tokens.source === 'web' ? null : tokens.refresh,
    };
  }

  private clearCookies(res: Response) {
    const options = {
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: this.config.get('COOKIE_SECURE')
        ? ('none' as const)
        : ('lax' as const),
      path: '/',
    };
    res.clearCookie('refresh_token', options);
    res.clearCookie('csrf_token', options);
  }
}
