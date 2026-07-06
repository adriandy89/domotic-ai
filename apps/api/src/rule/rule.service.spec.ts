import { InternalServerErrorException } from '@nestjs/common';
import { RuleService } from './rule.service';

type AnyMock = jest.Mock;

function makeService() {
  const db = {
    rule: {
      create: jest.fn() as AnyMock,
    },
  };
  const edgeSync = { notifyByHomeId: jest.fn().mockResolvedValue(undefined) as AnyMock };
  const service = new RuleService(db as any, edgeSync as any);
  return { service, db, edgeSync };
}

const dto = {
  name: 'Power on TV',
  home_id: 'home-1',
  conditions: [],
  results: [
    { device_id: 'tv1', attribute: 'power', data: { value: 'ON' }, type: 'COMMAND' },
  ],
} as any;

describe('RuleService.createRule', () => {
  it('returns the created rule and triggers an edge bundle sync', async () => {
    const { service, db, edgeSync } = makeService();
    db.rule.create.mockResolvedValue({ id: 'r1', home_id: 'home-1' });

    const result = await service.createRule(dto, 'user-1');

    expect(result).toEqual({ id: 'r1', home_id: 'home-1' });
    expect(edgeSync.notifyByHomeId).toHaveBeenCalledWith('home-1');
  });

  it('propagates DB failures instead of silently returning undefined', async () => {
    const { service, db, edgeSync } = makeService();
    db.rule.create.mockRejectedValue(new Error('DB down'));

    await expect(service.createRule(dto, 'user-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(edgeSync.notifyByHomeId).not.toHaveBeenCalled();
  });

  it('sanitizes empty-string result device_id to null (NOTIFICATION results)', async () => {
    const { service, db } = makeService();
    db.rule.create.mockResolvedValue({ id: 'r2', home_id: 'home-1' });

    await service.createRule(
      {
        ...dto,
        results: [{ device_id: '', attribute: null, data: {}, type: 'NOTIFICATION' }],
      },
      'user-1',
    );

    const created = db.rule.create.mock.calls[0][0];
    expect(created.data.results.createMany.data[0].device_id).toBeNull();
  });
});
