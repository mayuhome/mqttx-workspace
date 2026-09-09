import { Component, computed, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MqttxFactory, MqttxMessage, MqttxService } from 'mqttx';

const MAX_LOG_ENTRIES = 50;

interface BrokerEntry {
  name: string;
  url: string;
  service: MqttxService;
}

@Component({
  imports: [FormsModule, JsonPipe],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly mqttx = inject(MqttxService);
  private readonly factory = inject(MqttxFactory);

  protected readonly brokerUrl = signal('wss://broker.emqx.io:8084/mqtt');
  protected readonly subscribeTopicInput = signal('mqttx/demo/#');
  protected readonly publishTopic = signal('mqttx/demo/angular');
  protected readonly publishPayload = signal('{"hello":"mqttx"}');

  protected readonly status = this.mqttx.connectionStatus;
  protected readonly isConnected = this.mqttx.isConnected;
  protected readonly isConnecting = this.mqttx.isConnecting;
  protected readonly statistics = this.mqttx.statistics$;
  protected readonly lastError = signal<string | null>(null);

  private readonly log = signal<MqttxMessage[]>([]);
  protected readonly messages = this.log.asReadonly();
  protected readonly subscribedTopics = signal<string[]>([]);

  protected readonly canPublish = computed(() => this.isConnected() && this.publishTopic().trim().length > 0);

  protected readonly newBrokerName = signal('');
  protected readonly newBrokerUrl = signal('wss://broker.hivemq.com:8884/mqtt');
  protected readonly brokers = signal<BrokerEntry[]>([]);
  protected readonly canAddBroker = computed(
    () =>
      this.newBrokerName().trim().length > 0 &&
      this.newBrokerUrl().trim().length > 0 &&
      !this.brokers().some((entry) => entry.name === this.newBrokerName().trim()),
  );

  constructor() {
    this.mqttx.messages$.pipe(takeUntilDestroyed()).subscribe((message) => {
      this.log.update((entries) => [message, ...entries].slice(0, MAX_LOG_ENTRIES));
    });
    this.mqttx.errors$.pipe(takeUntilDestroyed()).subscribe((error) => this.lastError.set(error.message));
  }

  protected connect(): void {
    this.lastError.set(null);
    this.mqttx.connect({ url: this.brokerUrl() });
  }

  protected disconnect(): void {
    void this.mqttx.disconnect();
    this.subscribedTopics.set([]);
  }

  protected subscribeTopic(): void {
    const topic = this.subscribeTopicInput().trim();
    if (!topic) {
      return;
    }
    this.mqttx.subscribe(topic);
    this.subscribedTopics.update((topics) => (topics.includes(topic) ? topics : [...topics, topic]));
  }

  protected unsubscribeTopic(topic: string): void {
    this.mqttx.unsubscribe(topic);
    this.subscribedTopics.update((topics) => topics.filter((t) => t !== topic));
  }

  protected publish(): void {
    let payload: unknown = this.publishPayload();
    try {
      payload = JSON.parse(this.publishPayload());
    } catch {
      // not JSON, publish as plain text
    }
    this.mqttx.publish(this.publishTopic(), payload).catch((error: Error) => this.lastError.set(error.message));
  }

  protected clearLog(): void {
    this.log.set([]);
  }

  /** Adds a named broker connection via the factory-backed connection pool. */
  protected addBroker(): void {
    const name = this.newBrokerName().trim();
    const url = this.newBrokerUrl().trim();
    if (!name || !url || this.brokers().some((entry) => entry.name === name)) {
      return;
    }
    const service = this.factory.getOrCreate(name, { url });
    this.brokers.update((entries) => [...entries, { name, url, service }]);
    this.newBrokerName.set('');
  }

  protected reconnectBroker(entry: BrokerEntry): void {
    entry.service.connect({ url: entry.url });
  }

  protected disconnectBroker(entry: BrokerEntry): void {
    void entry.service.disconnect();
  }

  protected removeBroker(name: string): void {
    this.factory.remove(name);
    this.brokers.update((entries) => entries.filter((entry) => entry.name !== name));
  }

  protected sendTestMessage(entry: BrokerEntry): void {
    void entry.service.publish('mqttx/demo/multi', { from: entry.name, at: Date.now() });
  }
}

