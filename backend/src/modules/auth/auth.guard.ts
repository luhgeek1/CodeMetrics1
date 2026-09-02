import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthService } from './auth.service.js';
import { AuthRequest, GraphqlContext, permissions } from './auth.types.js';

export function requestFrom(context: ExecutionContext): AuthRequest {
  return context.getType<string>() === 'graphql'
    ? GqlExecutionContext.create(context).getContext<GraphqlContext>().req
    : context.switchToHttp().getRequest<AuthRequest>();
}
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => requestFrom(context).user,
);
export const RequirePermissions = (...slugs: string[]) =>
  SetMetadata('permissions', slugs);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = requestFrom(context);
    const header = request.headers.authorization;
    const match = header?.match(/^Bearer (.+)$/i);
    if (!match?.[1]) throw new UnauthorizedException('Not Authorized');
    request.user = await this.auth.authenticate(match[1]);
    const needed =
      this.reflector.getAllAndOverride<string[]>('permissions', [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const granted = permissions(request.user);
    if (needed.some((slug) => !granted.includes(slug)))
      throw new ForbiddenException("You don't have permission to do this");
    return true;
  }
}
