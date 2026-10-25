import { Module } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// PrismaModule is @Global; the jwt-access passport strategy is registered globally by AuthModule.
@Module({
  controllers: [UsersController],
  providers: [UsersService, SuperAdminGuard, JwtAccessGuard],
})
export class UsersModule {}
