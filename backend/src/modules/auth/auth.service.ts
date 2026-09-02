import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { hash, verify } from 'argon2';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Prisma, User } from '../../generated/prisma/client.js';
import { Environment } from '../../config/environment.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { parse } from '../../common/validation.js';
import { ClientSource, principalInclude } from './auth.types.js';

const credentials = z.object({
  email: z.email(),
  password: z.string().min(1).max(1024),
  username: z.string().max(256).nullish(),
});
const tokenSchema = z.object({
  sub: z.uuid(),
  jti: z.string().min(1),
  typ: z.enum(['access', 'refresh']),
  src: z.enum(['web', 'mobile']),
  av: z.number().int(),
  exp: z.number(),
  iat: z.number(),
});

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async throttle(ip: string) {
    const rows = await this.db.$queryRaw<{ hits: number }[]>`
      INSERT INTO auth_throttles(key, hits, expires_at) VALUES (${ip}, 1, NOW() + INTERVAL '60 seconds')
      ON CONFLICT(key) DO UPDATE SET
        hits = CASE WHEN auth_throttles.expires_at <= NOW() THEN 1 ELSE auth_throttles.hits + 1 END,
        expires_at = CASE WHEN auth_throttles.expires_at <= NOW() THEN NOW() + INTERVAL '60 seconds' ELSE auth_throttles.expires_at END
      RETURNING hits`;
    if ((rows[0]?.hits ?? 0) > 10)
      throw new HttpException('Too Many Requests', 429);
  }

  async register(input: unknown, source: ClientSource) {
    const data = parse(credentials, input);
    const passwordHash = await hash(data.password);
    try {
      return await this.db.$transaction(async (tx) => {
        const role = await tx.role.findUniqueOrThrow({
          where: { slug: 'member' },
        });
        const user = await tx.user.create({
          data: {
            email: data.email,
            passwordHash,
            username: data.username,
            isOnboarded: false,
            banned: false,
            userRoles: { create: { roleId: role.id } },
          },
        });
        return this.issue(user, source, tx);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'User with provided credentials already exists',
        );
      throw error;
    }
  }

  async login(input: unknown, source: ClientSource) {
    const data = parse(credentials, input);
    const user = await this.db.user.findUnique({
      where: { email: data.email },
    });
    let valid = false;
    if (user) {
      try {
        valid = await verify(user.passwordHash, data.password);
      } catch {
        valid = false;
      }
    }
    if (!user || !valid)
      throw new UnauthorizedException('Wrong credentials passed');
    if (user.banned) throw new ForbiddenException('Your account is banned');
    return this.issue(user, source);
  }

  private async issue(
    user: User,
    source: ClientSource,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const id = randomUUID().replaceAll('-', '');
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: user.id,
      jti: id,
      src: source,
      av: user.authVersion,
      iat: now,
    };
    const access = await this.jwt.signAsync({
      ...payload,
      typ: 'access',
      exp: now + this.config.get('ACCESS_TTL'),
    });
    const refresh = await this.jwt.signAsync({
      ...payload,
      typ: 'refresh',
      exp: now + this.config.get('REFRESH_TTL'),
    });
    await tx.refreshSession.create({
      data: {
        id,
        userId: user.id,
        source,
        authVersion: user.authVersion,
        expiresAt: new Date((now + this.config.get('REFRESH_TTL')) * 1000),
      },
    });
    return { access, refresh, csrf: this.csrf(refresh), source };
  }

  csrf(token: string) {
    return createHmac('sha256', this.config.get('CSRF_HMAC_KEY'))
      .update(token)
      .digest('hex');
  }

  private async decode(token: string, type: 'access' | 'refresh') {
    try {
      const payload = tokenSchema.parse(await this.jwt.verifyAsync(token));
      if (payload.typ !== type) throw new Error('Wrong token type');
      return payload;
    } catch {
      throw new UnauthorizedException(`Invalid ${type} token`);
    }
  }

  async authenticate(token: string) {
    const payload = await this.decode(token, 'access');
    const [user, session] = await Promise.all([
      this.db.user.findUnique({
        where: { id: payload.sub },
        include: principalInclude,
      }),
      this.db.refreshSession.findUnique({ where: { id: payload.jti } }),
    ]);
    if (!user || !session || session.revokedAt)
      throw new UnauthorizedException(
        'Access token expired, please sign in again',
      );
    if (user.banned) throw new ForbiddenException('Your account is banned');
    if (user.authVersion !== payload.av)
      throw new UnauthorizedException(
        'Access token expired, please sign in again',
      );
    return user;
  }

  async refresh(token: string, csrf?: string | null) {
    const payload = await this.decode(token, 'refresh');
    if (payload.src === 'web') {
      const expected = Buffer.from(this.csrf(token));
      const supplied = Buffer.from(csrf ?? '');
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(expected, supplied)
      )
        throw new UnauthorizedException('Invalid refresh token');
    }
    return this.db.$transaction(async (tx) => {
      await this.revokeSession(payload, tx);
      const user = await tx.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.banned)
        throw new UnauthorizedException('Invalid refresh token');
      return this.issue(user, payload.src, tx);
    });
  }

  async logout(token: string) {
    const payload = await this.decode(token, 'refresh');
    await this.db.$transaction((tx) => this.revokeSession(payload, tx));
  }

  private async revokeSession(
    payload: z.infer<typeof tokenSchema>,
    tx: Prisma.TransactionClient,
  ) {
    const session = await tx.refreshSession.findUnique({
      where: { id: payload.jti },
    });
    if (!session) throw new UnauthorizedException('Invalid refresh token');
    const updated = await tx.refreshSession.updateMany({
      where: {
        id: payload.jti,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    if (updated.count !== 1)
      throw new UnauthorizedException('Invalid refresh token');
  }
  @Cron('0 0 * * * *')
  async cleanupSessions() {
    await this.db.refreshSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.db.authThrottle.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
