import { HttpException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { unwrapResolverError } from '@apollo/server/errors';
import { GraphQLError } from 'graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { ScheduleModule } from '@nestjs/schedule';
import { fileURLToPath } from 'node:url';
import { Environment, validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { IntegrationModule } from './modules/integration/integration.module.js';
import { HealthController } from './health.controller.js';
import { HealthResolver } from './health.resolver.js';
import { GraphqlContext } from './modules/auth/auth.types.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    ScheduleModule.forRoot(),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        typePaths: [
          fileURLToPath(new URL('./schema.graphql', import.meta.url)),
        ],
        path: '/graphql',
        graphiql: false,
        introspection: config.get('GRAPHQL_SANDBOX'),
        plugins: [
          config.get('GRAPHQL_SANDBOX')
            ? ApolloServerPluginLandingPageLocalDefault({
                embed: true,
                includeCookies: true,
              })
            : ApolloServerPluginLandingPageDisabled(),
        ],
        resolvers: { JSON: GraphQLJSON },
        context: ({ req, res }: GraphqlContext) => ({ req, res }),
        csrfPrevention: true,
        formatError: (formatted, raw) => {
          const error = unwrapResolverError(raw);
          if (error instanceof HttpException) {
            const status = error.getStatus();
            return {
              message: error.message,
              locations: formatted.locations,
              path: formatted.path,
              extensions: {
                code:
                  (
                    {
                      400: 'BAD_USER_INPUT',
                      401: 'UNAUTHENTICATED',
                      403: 'FORBIDDEN',
                      404: 'NOT_FOUND',
                      409: 'CONFLICT',
                      429: 'TOO_MANY_REQUESTS',
                    } as Record<number, string>
                  )[status] ?? 'INTERNAL_SERVER_ERROR',
                status,
              },
            };
          }
          if (
            error instanceof GraphQLError &&
            formatted.extensions?.code !== 'INTERNAL_SERVER_ERROR'
          )
            return formatted;
          return {
            message: 'Internal server error',
            path: formatted.path,
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          };
        },
      }),
    }),
    AuthModule,
    UsersModule,
    CatalogModule,
    AnalyticsModule,
    IntegrationModule,
  ],
  controllers: [HealthController],
  providers: [HealthResolver],
})
export class AppModule {}
