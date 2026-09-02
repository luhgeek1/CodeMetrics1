import { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

export const principalInclude = {
  userRoles: {
    include: {
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  },
} satisfies Prisma.UserInclude;

export type Principal = Prisma.UserGetPayload<{
  include: typeof principalInclude;
}>;
export interface AuthRequest extends Request {
  user?: Principal;
}
export interface GraphqlContext {
  req: AuthRequest;
  res: Response;
}
export type ClientSource = 'web' | 'mobile';

export function permissions(user: Principal): string[] {
  return [
    ...new Set(
      user.userRoles.flatMap((item) =>
        item.role.rolePermissions.map((item) => item.permission.slug),
      ),
    ),
  ];
}
