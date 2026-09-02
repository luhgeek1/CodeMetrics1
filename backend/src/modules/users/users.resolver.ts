import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuthGuard,
  CurrentUser,
  RequirePermissions,
} from '../auth/auth.guard.js';
import { Principal } from '../auth/auth.types.js';
import { UsersService, userView } from './users.service.js';
import { AdminUsersInput, UserPatch } from '../../generated/graphql.js';

@Resolver()
export class UsersResolver {
  constructor(private readonly users: UsersService) {}
  @Query('me') @UseGuards(AuthGuard) me(@CurrentUser() user: Principal) {
    return userView(user);
  }
  @Mutation('updateProfile') @UseGuards(AuthGuard) patch(
    @CurrentUser() user: Principal,
    @Args('input') input: UserPatch,
  ) {
    return this.users.patch(user.id, input);
  }
  @Query('languages') languages(
    @Args('query') query: string,
    @Args('limit') limit: number | null,
  ) {
    return this.users.languages(query, limit);
  }
  @Query('adminUsers')
  @UseGuards(AuthGuard)
  @RequirePermissions('users.read')
  list(@Args('input') input: AdminUsersInput | null) {
    return this.users.list(input);
  }
  @Mutation('setUserBan')
  @UseGuards(AuthGuard)
  @RequirePermissions('users.ban')
  ban(@Args('userId') id: string, @Args('banned') banned: boolean) {
    return this.users.setBan(id, banned);
  }
  @Mutation('setUserRoles')
  @UseGuards(AuthGuard)
  @RequirePermissions('users.manage_roles')
  roles(@Args('userId') id: string, @Args('roles') roles: string[]) {
    return this.users.setRoles(id, roles);
  }
  @Query('registrations')
  @UseGuards(AuthGuard)
  @RequirePermissions('users.read')
  registrations(@Args('days') days: number) {
    return this.users.registrations(days);
  }
}
