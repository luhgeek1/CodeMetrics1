import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  AuthGuard,
  CurrentUser,
  RequirePermissions,
} from '../auth/auth.guard.js';
import { Principal } from '../auth/auth.types.js';
import { UsersService, userView } from './users.service.js';
import { z } from 'zod';
import { parse } from '../../common/validation.js';

@Controller('api/v1')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get('users/me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: Principal) {
    return userView(user);
  }
  @Patch('users/me')
  @UseGuards(AuthGuard)
  patch(@CurrentUser() user: Principal, @Body() input: unknown) {
    return this.users.patch(user.id, input);
  }
  @Get('languages')
  languages(
    @Query('query') query: unknown,
    @Query('limit') limit: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!query) res.setHeader('Cache-Control', 'max-age=86400');
    return this.users.languages(query, limit);
  }
  @Get('admins/users')
  @UseGuards(AuthGuard)
  @RequirePermissions('users.read')
  list(@Query() input: unknown) {
    return this.users.list(input);
  }
  @Put('admins/users/:id/roles')
  @UseGuards(AuthGuard)
  @RequirePermissions('users.manage_roles')
  roles(@Param('id') id: string, @Body() input: unknown) {
    return this.users.setRoles(
      id,
      parse(z.object({ roles: z.array(z.string()).default([]) }), input).roles,
    );
  }
  @Post('admins/users/:id/ban')
  @UseGuards(AuthGuard)
  @RequirePermissions('users.ban')
  ban(@Param('id') id: string) {
    return this.users.setBan(id, true);
  }
  @Get('admins/stats/registrations')
  @UseGuards(AuthGuard)
  @RequirePermissions('users.read')
  registrations(@Query('days') days: unknown) {
    return this.users.registrations(days);
  }
}
