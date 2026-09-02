import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Environment } from '../../config/environment.js';
import { AuthService } from './auth.service.js';
import { AuthTransport } from './auth.transport.js';
import { AuthGuard } from './auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthResolver } from './auth.resolver.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => {
        const rsa = !!config.get('JWT_PRIVATE_KEY');
        return {
          privateKey: rsa ? config.get('JWT_PRIVATE_KEY') : undefined,
          publicKey: rsa ? config.get('JWT_PUBLIC_KEY') : undefined,
          secret: rsa ? undefined : config.get('JWT_SECRET'),
          signOptions: { algorithm: rsa ? 'RS256' : 'HS256' },
          verifyOptions: { algorithms: [rsa ? 'RS256' : 'HS256'] },
        };
      },
    }),
  ],
  providers: [AuthService, AuthTransport, AuthGuard, AuthResolver],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
