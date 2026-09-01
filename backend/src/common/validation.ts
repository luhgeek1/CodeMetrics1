import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      detail: 'Invalid request',
      errors: result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export const uuid = z.uuid();
export const date = z.iso.date();
export const dateTime = z.iso.datetime({ offset: true });
export const nullableText = z.string().nullable().optional();
export const optionalList = z.preprocess(
  (value) =>
    value == null ? undefined : typeof value === 'string' ? [value] : value,
  z.array(uuid).max(500).optional(),
);
export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().max(2048).nullish(),
  after: dateTime.nullish(),
});

export function decodeCursor(
  value: string,
  delimiter = '|',
): { date: Date; id: string } {
  const index = value.indexOf(delimiter);
  const timestamp = value.slice(0, index);
  const id = value.slice(index + 1);
  const parsed = new Date(timestamp);
  if (index < 1 || !id || !Number.isFinite(parsed.getTime()))
    throw new BadRequestException('Invalid cursor');
  return { date: parsed, id };
}

export function encodeCursor(date: Date, id: string, delimiter = '|') {
  return `${date.toISOString()}${delimiter}${id}`;
}
