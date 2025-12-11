import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateWorkTimeDto } from './dto/create-work-time.dto';
import { UpdateWorkTimeDto } from './dto/update-work-time.dto';
import { WorkTime } from './entities/work-time.entity';

@Injectable()
export class WorkTimeService {
  constructor(
    @InjectRepository(WorkTime)
    private readonly workTimeRepository: Repository<WorkTime>,
  ) {}

  async create(createWorkTimeDto: CreateWorkTimeDto): Promise<WorkTime> {
    const existing = await this.workTimeRepository.find({ order: { startDate: 'ASC' } });
    if (existing.length > 0) {
      throw new BadRequestException('Work time slot already exists');
    }
    const startDate = this.normalizeToUtc(createWorkTimeDto.startDate);
    const endDate = this.normalizeToUtc(createWorkTimeDto.endDate);
    if (startDate && endDate && endDate <= startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }

    const entity = this.workTimeRepository.create({
      startDate,
      endDate,
      startTime: createWorkTimeDto.startTime ?? null,
      endTime: createWorkTimeDto.endTime ?? null,
    });
    return this.workTimeRepository.save(entity);
  }

  async findAll(): Promise<WorkTime[]> {
    return this.workTimeRepository.find({ order: { startDate: 'ASC' } });
  }

  async findOne(id: number): Promise<WorkTime> {
    const workTime = await this.workTimeRepository.findOne({ where: { id } });
    if (!workTime) throw new NotFoundException('Work time slot not found');
    return workTime;
  }

  async update(id: number, updateWorkTimeDto: UpdateWorkTimeDto): Promise<WorkTime> {
    const existing = await this.findOne(id);

    if (updateWorkTimeDto.startDate) {
      existing.startDate = this.normalizeToUtc(updateWorkTimeDto.startDate);
    }
    if (updateWorkTimeDto.startDate === null) existing.startDate = null;

    if (updateWorkTimeDto.endDate) existing.endDate = this.normalizeToUtc(updateWorkTimeDto.endDate);
    if (updateWorkTimeDto.endDate === null) existing.endDate = null;

    if (updateWorkTimeDto.startTime !== undefined) existing.startTime = updateWorkTimeDto.startTime ?? null;
    if (updateWorkTimeDto.endTime !== undefined) existing.endTime = updateWorkTimeDto.endTime ?? null;

    if (existing.startDate && existing.endDate && existing.endDate <= existing.startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }

    return this.workTimeRepository.save(existing);
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findOne(id);
    await this.workTimeRepository.remove(existing);
  }

  private normalizeToUtc(value?: string | Date | null): Date | null {
    if (value === null || value === undefined) return null;
    const normalizedString =
      typeof value === 'string' && !value.endsWith('Z') && !value.includes('+')
        ? `${value}Z`
        : value;
    const date = new Date(normalizedString);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date value');
    return new Date(date.toISOString()); // ensure UTC normalization
  }
}
