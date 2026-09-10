import { TestBed } from '@angular/core/testing';
import { EventEmitter } from 'events';
import mqtt from 'mqtt';
import { vi } from 'vitest';
import { MqttxService } from './mqttx';

class FakeMqttClient extends EventEmitter {
  options: { reconnectPeriod?: number };
  subscribe = vi.fn();
  unsubscribe = vi.fn();
  publishAsync = vi.fn().mockResolvedValue(undefined);
  override removeAllListeners = vi.fn((event?: string | symbol) => super.removeAllListeners(event));
  end = vi.fn((_force?: boolean, _opts?: unknown, cb?: () => void) => {
    cb?.();
    return this;
  });

  constructor(options: { reconnectPeriod?: number } = {}) {
    super();
    this.options = { reconnectPeriod: 4000, ...options };
  }
}

let lastClient: FakeMqttClient | undefined;

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn((_url: string, options?: { reconnectPeriod?: number }) => {
      lastClient = new FakeMqttClient(options);
      return lastClient;
    }),
  },
}));

describe('MqttxService', () => {
  let service: MqttxService;

  beforeEach(() => {
    lastClient = undefined;
    vi.mocked(mqtt.connect).mockClear();
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

  it('reports disconnected status and allows reconnecting after disconnect()', async () => {
    const connectMock = vi.mocked(mqtt.connect);

    service.connect({ url: 'mqtt://broker.local' });
    await vi.waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    lastClient!.emit('connect');
    await vi.waitFor(() => expect(service.isConnected()).toBe(true));

    await service.disconnect();
    expect(service.connectionStatus()).toBe('disconnected');
    expect(service.isConnected()).toBe(false);
    expect(service.isConnecting()).toBe(false);

    service.connect({ url: 'mqtt://broker.local' });
    await vi.waitFor(() => expect(connectMock).toHaveBeenCalledTimes(2));
    const secondClient = connectMock.mock.results[1].value as FakeMqttClient;
    secondClient.emit('connect');
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

  it('applies exponential backoff to the reconnect period, capped at maxReconnectPeriod', async () => {
    service.connect({
      url: 'mqtt://broker.local',
      reconnectPeriod: 100,
      reconnectBackoffMultiplier: 2,
      maxReconnectPeriod: 300,
      maxReconnectAttempts: 10,
    });
    await vi.waitFor(() => expect(lastClient).toBeDefined());
    const client = lastClient!;

    client.emit('reconnect');
    expect(client.options.reconnectPeriod).toBe(200);
    client.emit('reconnect');
    expect(client.options.reconnectPeriod).toBe(300);
    client.emit('reconnect');
    expect(client.options.reconnectPeriod).toBe(300); // capped

    client.emit('connect');
    await vi.waitFor(() => expect(service.isConnected()).toBe(true));
    expect(client.options.reconnectPeriod).toBe(100); // reset on success
  });

  it('queues publishes made while offline and flushes them once connected', async () => {
    service.connect({ url: 'mqtt://broker.local', queueOfflineMessages: true });
    await vi.waitFor(() => expect(lastClient).toBeDefined());
    const client = lastClient!;

    const sent = service.publish('a/b', { x: 1 });
    client.emit('connect');

    await sent;
    expect(client.publishAsync).toHaveBeenCalledWith('a/b', JSON.stringify({ x: 1 }), {
      qos: 0,
      retain: false,
      dup: false,
    });
  });

  it('emits debug logs when debug is enabled', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    service.connect({ url: 'mqtt://broker.local', debug: true });
    await vi.waitFor(() => expect(lastClient).toBeDefined());

    lastClient!.emit('connect');
    await vi.waitFor(() => expect(debugSpy).toHaveBeenCalledWith('[mqttx] connected', expect.anything()));
    debugSpy.mockRestore();
  });

  it('processes a high volume of messages within a reasonable time budget', async () => {
    service.connect({ url: 'mqtt://broker.local' });
    await vi.waitFor(() => expect(lastClient).toBeDefined());
    lastClient!.emit('connect');
    await vi.waitFor(() => expect(service.isConnected()).toBe(true));

    let received = 0;
    service.onTopic('bench/+/reading').subscribe(() => received++);

    const messageCount = 5000;
    const payload = Buffer.from(JSON.stringify({ value: 1 }));
    const start = performance.now();
    for (let i = 0; i < messageCount; i++) {
      lastClient!.emit('message', `bench/${i}/reading`, payload, { qos: 0, retain: false });
    }
    const elapsedMs = performance.now() - start;

    expect(received).toBe(messageCount);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
