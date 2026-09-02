import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { UsersResolver } from './users.resolver.js';

@Module({
  imports: [AuthModule],
  providers: [UsersService, UsersResolver],
  controllers: [UsersController],
})
export class UsersModule {}
