import { TestBed } from '@angular/core/testing';
import { EventEmitter } from 'events';
import mqtt from 'mqtt';
import { vi } from 'vitest';
import { MqttxService } from './mqttx';

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

let lastClient: FakeMqttClient | undefined;

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => {
      lastClient = new FakeMqttClient();
      return lastClient;
    }),
  },
}));

describe('MqttxService', () => {
  let service: MqttxService;

  beforeEach(() => {
    lastClient = undefined;
    TestBed.configureTestingModule({});
    service = TestBed.inject(MqttxService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('connects and reports connectionStatus/isConnected', async () => {
    expect(service.connectionStatus()).toBe('disconnected');

    service.connect({ url: 'mqtt://broker.local' });
    await vi.waitFor(() => expect(lastClient).toBeDefined());

    lastClient!.emit('connect');
    await vi.waitFor(() => expect(service.isConnected()).toBe(true));
  });

  it('flushes queued subscriptions once connected', async () => {
    service.subscribe('a/b', { qos: 1 });
    service.connect({ url: 'mqtt://broker.local' });
    await vi.waitFor(() => expect(lastClient).toBeDefined());

    lastClient!.emit('connect');
    await vi.waitFor(() => expect(lastClient!.subscribe).toHaveBeenCalledWith(['a/b'], { qos: 1 }));
  });

  it('delivers JSON messages matching wildcard topics via onTopic', async () => {
    service.connect({ url: 'mqtt://broker.local' });
    await vi.waitFor(() => expect(lastClient).toBeDefined());
    lastClient!.emit('connect');
    await vi.waitFor(() => expect(service.isConnected()).toBe(true));

    const received: unknown[] = [];
    service.onTopic<{ value: number }>('sensors/+/temperature').subscribe((value) => received.push(value));

    lastClient!.emit('message', 'sensors/1/temperature', Buffer.from(JSON.stringify({ value: 21 })), {
      qos: 0,
      retain: false,
    });

    expect(received).toEqual([{ value: 21 }]);
  });

  it('rejects publish when not connected', async () => {
    await expect(service.publish('a/b', { x: 1 })).rejects.toThrow();
  });

  it('publishes JSON-encoded payloads once connected', async () => {
    service.connect({ url: 'mqtt://broker.local' });
    await vi.waitFor(() => expect(lastClient).toBeDefined());
    lastClient!.emit('connect');
    await vi.waitFor(() => expect(service.isConnected()).toBe(true));

    await service.publish('a/b', { x: 1 }, { qos: 1 });

    expect(lastClient!.publishAsync).toHaveBeenCalledWith('a/b', JSON.stringify({ x: 1 }), {
      qos: 1,
      retain: false,
      dup: false,
    });
  });

  it('does not pass undefined options that would override the URL-parsed path', async () => {
    service.connect({ url: 'wss://broker.emqx.io:8084/mqtt' });
    await vi.waitFor(() => expect(lastClient).toBeDefined());

    const [, options] = vi.mocked(mqtt.connect).mock.calls.at(-1)!;
    expect(options).not.toHaveProperty('path');
    expect(options).not.toHaveProperty('username');
    expect(options).not.toHaveProperty('password');
  });

  it('stops retrying after exceeding maxReconnectAttempts', async () => {
    service.connect({ url: 'mqtt://broker.local', maxReconnectAttempts: 2 });
    await vi.waitFor(() => expect(lastClient).toBeDefined());
    const client = lastClient!;

    client.emit('reconnect');
    client.emit('reconnect');
    client.emit('reconnect');

    await vi.waitFor(() => expect(service.connectionStatus()).toBe('error'));
    expect(client.end).toHaveBeenCalledWith(true);
  });
});
