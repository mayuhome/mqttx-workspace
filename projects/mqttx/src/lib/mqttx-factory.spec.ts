import { TestBed } from '@angular/core/testing';
import { EventEmitter } from 'events';
import { vi } from 'vitest';
import { MqttxFactory } from './mqttx-factory';
import { MQTTX_POOL_SIZE } from './tokens/mqttx.tokens';

class FakeMqttClient extends EventEmitter {
  options: { reconnectPeriod?: number } = { reconnectPeriod: 4000 };
  subscribe = vi.fn();
  unsubscribe = vi.fn();
  publishAsync = vi.fn().mockResolvedValue(undefined);
  override removeAllListeners = vi.fn((event?: string | symbol) => super.removeAllListeners(event));
  end = vi.fn((_force?: boolean, _opts?: unknown, cb?: () => void) => {
    cb?.();
    return this;
  });
}

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => new FakeMqttClient()),
  },
}));

describe('MqttxFactory', () => {
  let factory: MqttxFactory;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    factory = TestBed.inject(MqttxFactory);
  });

  it('should create an instance', () => {
    expect(factory).toBeTruthy();
  });

  it('reuses the same client instance for the same name', () => {
    const a = factory.getOrCreate('broker-a', { url: 'mqtt://broker.local' });
    const b = factory.getOrCreate('broker-a', { url: 'mqtt://broker.local' });
    expect(a).toBe(b);
    expect(factory.get('broker-a')).toBe(a);
  });

  it('creates independent clients per name', () => {
    const a = factory.getOrCreate('broker-a', { url: 'mqtt://broker-a.local' });
    const b = factory.getOrCreate('broker-b', { url: 'mqtt://broker-b.local' });
    expect(a).not.toBe(b);
  });

  it('removes a tracked client', () => {
    factory.getOrCreate('broker-a', { url: 'mqtt://broker.local' });
    factory.remove('broker-a');
    expect(factory.get('broker-a')).toBeUndefined();
  });

  it('reports pool size and names', () => {
    factory.getOrCreate('broker-a', { url: 'mqtt://broker-a.local' });
    factory.getOrCreate('broker-b', { url: 'mqtt://broker-b.local' });
    expect(factory.size()).toBe(2);
    expect(factory.names()).toEqual(['broker-a', 'broker-b']);
  });
});

describe('MqttxFactory (bounded pool)', () => {
  let factory: MqttxFactory;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: MQTTX_POOL_SIZE, useValue: 2 }] });
    factory = TestBed.inject(MqttxFactory);
  });

  it('evicts the least-recently-used client once the pool is full', () => {
    factory.getOrCreate('broker-a', { url: 'mqtt://broker-a.local' });
    factory.getOrCreate('broker-b', { url: 'mqtt://broker-b.local' });
    factory.get('broker-a'); // touch broker-a so broker-b becomes the LRU entry
    factory.getOrCreate('broker-c', { url: 'mqtt://broker-c.local' });

    expect(factory.size()).toBe(2);
    expect(factory.get('broker-b')).toBeUndefined();
    expect(factory.get('broker-a')).toBeDefined();
    expect(factory.get('broker-c')).toBeDefined();
  });
});
