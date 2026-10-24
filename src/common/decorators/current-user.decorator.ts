import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return null;
    if (data === 'id' || data === 'userId') {
      return user._id ? user._id.toString() : user.id || null;
    }
    return data ? user[data] : user;
  },
);