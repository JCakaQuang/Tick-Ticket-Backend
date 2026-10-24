import { BadRequestException } from '@nestjs/common';

export function literalSearch(value: string): RegExp {
  if (typeof value !== 'string' || value.length > 200) {
    throw new BadRequestException('Search must be a string of at most 200 characters');
  }
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}
