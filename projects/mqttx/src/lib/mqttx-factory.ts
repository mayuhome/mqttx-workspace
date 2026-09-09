import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { MqttxService } from './services/mqttx';
import { MqttxConnectionConfig } from './types/mqttx.types';

/**
 * Creates and tracks independent, named `MqttxService` instances for apps that need to
 * talk to multiple brokers at once (each instance has its own client, subscriptions and state).
 */
@Injectable({ providedIn: 'root' })
export class MqttxFactory {
  private readonly injector = inject(EnvironmentInjector);
  private readonly clients = new Map<string, MqttxService>();

  /** Returns the named client, (re)connecting it with `config` if it already exists. */
  public getOrCreate(name: string, config: MqttxConnectionConfig): MqttxService {
    const existing = this.clients.get(name);
    if (existing) {
      existing.connect(config);
      return existing;
    }

    // Instantiate within the environment injector so `inject()`/`resource()` work inside the service.
    const client = runInInjectionContext(this.injector, () => new MqttxService());
    client.connect(config);
    this.clients.set(name, client);
    return client;
  }

  public get(name: string): MqttxService | undefined {
    return this.clients.get(name);
  }

  public remove(name: string): void {
    const client = this.clients.get(name);
    if (client) {
      client.disconnect();
      this.clients.delete(name);
    }
  }

  public disconnectAll(): void {
    this.clients.forEach((client) => client.disconnect());
    this.clients.clear();
  }
}

