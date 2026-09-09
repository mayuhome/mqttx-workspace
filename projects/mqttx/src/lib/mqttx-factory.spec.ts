import { TestBed } from '@angular/core/testing';
import { EventEmitter } from 'events';
import { vi } from 'vitest';
import { MqttxFactory } from './mqttx-factory';

class FakeMqttClient extends EventEmitter {
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
});
