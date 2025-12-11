import { IsISO8601, IsOptional, Matches } from 'class-validator';

export class CreateWorkTimeDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string | null;

  @IsOptional()
  @IsISO8601()
  endDate?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime must be HH:mm in 24h format' })
  startTime?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime must be HH:mm in 24h format' })
  endTime?: string | null;
}
