import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { MQTTX_DEFAULT_MAX_POOL_SIZE } from './constants/mqttx.constants';
import { MqttxService } from './services/mqttx';
import { MQTTX_POOL_SIZE } from './tokens/mqttx.tokens';
import { MqttxConnectionConfig } from './types/mqttx.types';

interface PooledClient {
  service: MqttxService;
  lastUsedAt: number;
}

/**
 * Creates and tracks independent, named `MqttxService` instances for apps that need to
 * talk to multiple brokers at once (each instance has its own client, subscriptions and state).
 *
 * Acts as a bounded connection pool: once `maxPoolSize` is reached, the least-recently-used
 * client is disconnected and evicted to make room for a newly requested one.
 */
@Injectable({ providedIn: 'root' })
export class MqttxFactory {
  private readonly injector = inject(EnvironmentInjector);
  private readonly maxPoolSize = inject(MQTTX_POOL_SIZE, { optional: true }) ?? MQTTX_DEFAULT_MAX_POOL_SIZE;
  private readonly clients = new Map<string, PooledClient>();
  private accessCounter = 0;

  /** Returns the named client, (re)connecting it with `config` if it already exists. */
  public getOrCreate(name: string, config: MqttxConnectionConfig): MqttxService {
    const existing = this.clients.get(name);
    if (existing) {
      existing.lastUsedAt = ++this.accessCounter;
      existing.service.connect(config);
      return existing.service;
    }

    if (this.clients.size >= this.maxPoolSize) {
      this.evictLeastRecentlyUsed();
    }

    // Instantiate within the environment injector so `inject()`/`resource()` work inside the service.
    const service = runInInjectionContext(this.injector, () => new MqttxService());
    service.connect(config);
    this.clients.set(name, { service, lastUsedAt: ++this.accessCounter });
    return service;
  }

  public get(name: string): MqttxService | undefined {
    const entry = this.clients.get(name);
    if (!entry) {
      return undefined;
    }
    entry.lastUsedAt = ++this.accessCounter;
    return entry.service;
  }

  public remove(name: string): void {
    const entry = this.clients.get(name);
    if (entry) {
      entry.service.disconnect();
      this.clients.delete(name);
    }
  }

  public disconnectAll(): void {
    this.clients.forEach((entry) => entry.service.disconnect());
    this.clients.clear();
  }

  /** Number of clients currently held in the pool. */
  public size(): number {
    return this.clients.size;
  }

  /** Names of all clients currently held in the pool. */
  public names(): string[] {
    return [...this.clients.keys()];
  }

  private evictLeastRecentlyUsed(): void {
    let oldestName: string | undefined;
    let oldestAt = Infinity;
    this.clients.forEach((entry, name) => {
      if (entry.lastUsedAt < oldestAt) {
        oldestAt = entry.lastUsedAt;
        oldestName = name;
      }
    });
    if (oldestName !== undefined) {
      this.remove(oldestName);
    }
  }
}

