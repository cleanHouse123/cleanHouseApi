import { BadRequestException, NotFoundException } from '@nestjs/common';

export class CouponNotFoundError extends NotFoundException {
  constructor() {
    super('Промокод не найден');
  }
}

export class CouponInactiveError extends BadRequestException {
  constructor() {
    super('Промокод недоступен');
  }
}

export class CouponExpiredError extends BadRequestException {
  constructor() {
    super('Срок действия промокода истёк');
  }
}

export class CouponScopeMismatchError extends BadRequestException {
  constructor() {
    super('Промокод не применим к этой покупке');
  }
}

export class CouponPlanMismatchError extends BadRequestException {
  constructor() {
    super('Промокод не применим к этому плану');
  }
}

export class CouponMinAmountError extends BadRequestException {
  constructor() {
    super('Сумма покупки меньше минимальной для промокода');
  }
}

export class CouponAlreadyUsedError extends BadRequestException {
  constructor() {
    super('Вы уже использовали этот промокод');
  }
}

export class CouponLimitReachedError extends BadRequestException {
  constructor() {
    super('Лимит использований промокода исчерпан');
  }
}
