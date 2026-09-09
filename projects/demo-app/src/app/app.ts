import { Component, computed, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MqttxMessage, MqttxService } from 'mqttx';

const MAX_LOG_ENTRIES = 50;

@Component({
  imports: [FormsModule, JsonPipe],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly mqttx = inject(MqttxService);

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
}
