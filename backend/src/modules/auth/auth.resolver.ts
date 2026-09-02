import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { GraphqlContext } from './auth.types.js';
import { AuthTransport } from './auth.transport.js';
import { UserLogin, UserRegister } from '../../generated/graphql.js';

@Resolver()
export class AuthResolver {
  constructor(private readonly transport: AuthTransport) {}
  @Mutation('register') register(
    @Args('input') input: UserRegister,
    @Args('client') client: string,
    @Context() ctx: GraphqlContext,
  ) {
    return this.transport.credentials(
      'register',
      input,
      client,
      ctx.req,
      ctx.res,
    );
  }
  @Mutation('login') login(
    @Args('input') input: UserLogin,
    @Args('client') client: string,
    @Context() ctx: GraphqlContext,
  ) {
    return this.transport.credentials('login', input, client, ctx.req, ctx.res);
  }
  @Mutation('refresh') refresh(
    @Args('refreshToken') token: string | null,
    @Args('csrfToken') csrf: string | null,
    @Context() ctx: GraphqlContext,
  ) {
    return this.transport.refresh(ctx.req, ctx.res, token, csrf);
  }
  @Mutation('logout') logout(
    @Args('refreshToken') token: string | null,
    @Context() ctx: GraphqlContext,
  ) {
    return this.transport.logout(ctx.req, ctx.res, token);
  }
}
