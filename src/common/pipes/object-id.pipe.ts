import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';

@Injectable()
export class ObjectIdPipe implements PipeTransform {
  transform(value: unknown) {
    if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new BadRequestException('Invalid object ID');
    return value;
  }
}
