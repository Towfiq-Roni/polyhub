import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto, ValidationErrorResponseDto } from '../../common/dto/error-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user-requests.dto';
import { UserAdminViewDto } from './dto/user-response.dto';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { UsersService } from './users.service';

interface Actor {
  id: string;
}

// Routes are not throttled (no 429). No DELETE: users are archived via status (ERD 1.4).
@ApiTags('users')
@Controller('users')
@UseGuards(JwtAccessGuard, SuperAdminGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a user with an admin-set password' })
  @ApiResponse({ status: 201, description: 'User created', type: UserAdminViewDto })
  @ApiResponse({ status: 400, description: 'Validation failed', type: ValidationErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Caller is not an active Super Admin', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'Email already in use', type: ErrorResponseDto })
  create(@CurrentUser() actor: Actor, @Body() body: CreateUserDto): Promise<UserAdminViewDto> {
    return this.usersService.create(actor.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({ status: 200, description: 'All users, oldest first', type: UserAdminViewDto, isArray: true })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Caller is not an active Super Admin', type: ErrorResponseDto })
  list(): Promise<UserAdminViewDto[]> {
    return this.usersService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one user' })
  @ApiResponse({ status: 200, description: 'The user', type: UserAdminViewDto })
  @ApiResponse({ status: 400, description: 'Malformed id', type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Caller is not an active Super Admin', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UserAdminViewDto> {
    return this.usersService.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a user email and/or name' })
  @ApiResponse({ status: 200, description: 'User updated', type: UserAdminViewDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed, malformed id, or no field supplied',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Caller is not an active Super Admin', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'Email already in use', type: ErrorResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserAdminViewDto> {
    return this.usersService.update(actor.id, id, body);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a user and revoke all their sessions (idempotent)' })
  @ApiResponse({ status: 200, description: 'User is inactive', type: UserAdminViewDto })
  @ApiResponse({ status: 400, description: 'Malformed id', type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Caller is not an active Super Admin', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponseDto })
  @ApiResponse({ status: 422, description: 'Cannot deactivate the last active Super Admin', type: ErrorResponseDto })
  deactivate(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<UserAdminViewDto> {
    return this.usersService.deactivate(actor.id, id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a user and clear lockout (idempotent)' })
  @ApiResponse({ status: 200, description: 'User is active', type: UserAdminViewDto })
  @ApiResponse({ status: 400, description: 'Malformed id', type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Caller is not an active Super Admin', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponseDto })
  activate(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<UserAdminViewDto> {
    return this.usersService.activate(actor.id, id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin-set a temporary password, clear lockout, revoke all sessions' })
  @ApiResponse({ status: 200, description: 'Password reset', type: UserAdminViewDto })
  @ApiResponse({ status: 400, description: 'Validation failed or malformed id', type: ValidationErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Caller is not an active Super Admin', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponseDto })
  resetPassword(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetPasswordDto,
  ): Promise<UserAdminViewDto> {
    return this.usersService.resetPassword(actor.id, id, body);
  }
}
