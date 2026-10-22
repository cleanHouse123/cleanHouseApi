import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PriceService } from './price.service';
import { User } from '../user/entities/user.entity';
import { Order } from '../order/entities/order.entity';
import { UserAddress } from '../address/entities/user-address';

/**
 * Цена разового заказа. Отдельно проверяем первый заказ: он должен стоить 1 ₽
 * за базовый вынос, а не дороже обычного, как было до исправления.
 */
describe('PriceService.getOrderPrice', () => {
  const FIRST_ORDER_ADDRESS = 'a1';

  const buildService = async (opts: {
    /** есть ли у пользователя уже заказ за 1 ₽ */
    usedFirstOrder: boolean;
  }) => {
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'u1' }),
    };
    const orderRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue(opts.usedFirstOrder ? { id: 'o1' } : null),
    };
    const userAddressRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: FIRST_ORDER_ADDRESS,
        address: 'Янино-1, Шоссейная 3а',
        addressDetails: { flat: '1' },
        // скидка первого заказа для адреса ещё не использована
        usageFeatures: [],
      }),
      find: jest.fn().mockResolvedValue([]),
      // поиск дублей адреса по данным DaData
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PriceService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Order), useValue: orderRepository },
        {
          provide: getRepositoryToken(UserAddress),
          useValue: userAddressRepository,
        },
      ],
    }).compile();

    return moduleRef.get(PriceService);
  };

  describe('обычный заказ', () => {
    it.each([
      [1, 14900],
      [2, 19900],
      [3, 24900],
      [4, 34900],
      [5, 39900],
      [6, 54800],
    ])('%i пакет(ов) стоит %i копеек', async (packages, expected) => {
      const service = await buildService({ usedFirstOrder: true });

      await expect(
        service.getOrderPrice({
          userId: 'u1',
          numberPackages: packages,
          addressId: FIRST_ORDER_ADDRESS,
        }),
      ).resolves.toBe(expected);
    });
  });

  describe('первый заказ', () => {
    it.each([
      [1, 100],
      [2, 100],
      [3, 5100],
      [4, 15100],
      [5, 20100],
      [6, 35000],
    ])(
      '%i пакет(ов): 1 ₽ за базу плюс разница сверх двух пакетов = %i копеек',
      async (packages, expected) => {
        const service = await buildService({ usedFirstOrder: false });

        await expect(
          service.getOrderPrice({
            userId: 'u1',
            numberPackages: packages,
            addressId: FIRST_ORDER_ADDRESS,
          }),
        ).resolves.toBe(expected);
      },
    );

    it('никогда не дороже обычной цены', async () => {
      const first = await buildService({ usedFirstOrder: false });
      const regular = await buildService({ usedFirstOrder: true });

      for (const packages of [1, 2, 3, 4, 5, 6]) {
        const firstPrice = await first.getOrderPrice({
          userId: 'u1',
          numberPackages: packages,
          addressId: FIRST_ORDER_ADDRESS,
        });
        const regularPrice = await regular.getOrderPrice({
          userId: 'u1',
          numberPackages: packages,
          addressId: FIRST_ORDER_ADDRESS,
        });

        expect(firstPrice).toBeLessThan(regularPrice);
      }
    });

    it('не применяется, когда скидку вытесняет промокод', async () => {
      const service = await buildService({ usedFirstOrder: false });

      await expect(
        service.getOrderPrice({
          userId: 'u1',
          numberPackages: 2,
          addressId: FIRST_ORDER_ADDRESS,
          skipFirstOrderDiscount: true,
        }),
      ).resolves.toBe(19900);
    });
  });
});
