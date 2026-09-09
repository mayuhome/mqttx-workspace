import { DestroyRef, Injectable, OnDestroy, computed, inject, resource, signal } from '@angular/core';
import mqtt from 'mqtt';
import type { IClientOptions, MqttClient } from 'mqtt';
import { Observable, Subject, filter, firstValueFrom, map, shareReplay, throttleTime, timeout } from 'rxjs';
import {
  MQTTX_DEFAULT_CONFIG,
  MQTTX_DEFAULT_MAX_QUEUED_MESSAGES,
  MQTTX_DEFAULT_MAX_RECONNECT_ATTEMPTS,
  MQTTX_DEFAULT_MAX_RECONNECT_PERIOD,
  MQTTX_DEFAULT_RECONNECT_BACKOFF_MULTIPLIER,
  MQTTX_DEFAULT_RECONNECT_PERIOD,
  MQTTX_DEFAULT_REQUEST_TIMEOUT,
  MQTTX_MESSAGE_BUFFER_SIZE,
} from '../constants/mqttx.constants';
import { MQTTX_CONFIG } from '../tokens/mqttx.tokens';
import {
  MqttxConnectionConfig,
  MqttxConnectionStatus,
  MqttxMessage,
  MqttxPublishOptions,
  MqttxStatistics,
} from '../types/mqttx.types';

/**
 * Angular-native wrapper around mqtt.js.
 *
 * Connection state is modeled with a signal-backed `resource()`: writing a new config via
 * `connect()` reactively (re)creates the underlying `MqttClient`, while `disconnect()` tears
 * it down. Ongoing lifecycle events (reconnect/offline/error) are reflected in `connectionStatus`.
 */
@Injectable({ providedIn: 'root' })
export class MqttxService implements OnDestroy {
  private readonly appDefaultConfig = inject(MQTTX_CONFIG, { optional: true });

  private readonly requestedConfig = signal<MqttxConnectionConfig | null>(null);
  private readonly status = signal<MqttxConnectionStatus>('disconnected');
  private readonly subscriptions = new Map<string, { qos: 0 | 1 | 2 }>();
  private readonly messageSubject = new Subject<MqttxMessage>();
  private readonly errorSubject = new Subject<Error>();
  private readonly statistics = signal<MqttxStatistics>({
    connectionAttempts: 0,
    successfulConnections: 0,
    failedConnections: 0,
    messagesReceived: 0,
    messagesSent: 0,
    reconnections: 0,
  });

  /** Reactive connection resource: re-runs `createClient` whenever `requestedConfig` changes. */
  private readonly clientResource = resource<MqttClient | null, MqttxConnectionConfig | null>({
    params: () => this.requestedConfig(),
    loader: async ({ params, abortSignal }) => {
      if (this.activeClient) {
        this.activeClient.removeAllListeners();
        this.activeClient.end(true);
        this.activeClient = null;
      }
      if (!params) {
        return null;
      }
      return this.createClient(params, abortSignal);
    },
  });

  private activeClient: MqttClient | null = null;
  private activeConfig: MqttxConnectionConfig | null = null;
  private reconnectAttempts = 0;
  private readonly offlineQueue: Array<{
    topic: string;
    payload: unknown;
    options: MqttxPublishOptions;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  // Public readonly state
  public readonly connectionStatus = this.status.asReadonly();
  public readonly isConnected = computed(() => this.status() === 'connected');
  public readonly isConnecting = computed(() => this.status() === 'connecting' || this.status() === 'reconnecting');
  public readonly connectionError = computed(() => this.clientResource.error() as Error | undefined);
  public readonly statistics$ = this.statistics.asReadonly();
  public readonly errors$ = this.errorSubject.asObservable();
  public readonly messages$ = this.messageSubject
    .asObservable()
    .pipe(shareReplay({ bufferSize: MQTTX_MESSAGE_BUFFER_SIZE, refCount: true }));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.ngOnDestroy());
  }

  /** Connect (or reconnect with a new config) to the MQTT broker. */
  public connect(config: MqttxConnectionConfig): void {
    this.requestedConfig.set({
      ...MQTTX_DEFAULT_CONFIG,
      ...this.appDefaultConfig,
      ...config,
      clientId: config.clientId ?? this.appDefaultConfig?.clientId ?? this.generateClientId(),
    });
  }

  /** Disconnect from the MQTT broker. */
  public disconnect(force = false): Promise<void> {
    const client = this.activeClient;
    this.activeClient = null;
    this.activeConfig = null;
    this.requestedConfig.set(null);
    this.rejectOfflineQueue(new Error('MqttxService: disconnected before queued message could be sent'));
    if (!client) {
      return Promise.resolve();
    }
    client.removeAllListeners();
    return new Promise((resolve) => client.end(force, {}, () => resolve()));
  }

  /** Subscribe to one or more topics (re-subscribed automatically on reconnect). */
  public subscribe(topics: string | string[], options: { qos?: 0 | 1 | 2 } = {}): void {
    const list = Array.isArray(topics) ? topics : [topics];
    const qos = options.qos ?? 0;
    list.forEach((topic) => this.subscriptions.set(topic, { qos }));
    if (this.activeClient && this.isConnected()) {
      this.activeClient.subscribe(list, { qos });
    }
  }

  /** Unsubscribe from one or more topics. */
  public unsubscribe(topics: string | string[]): void {
    const list = Array.isArray(topics) ? topics : [topics];
    list.forEach((topic) => this.subscriptions.delete(topic));
    if (this.activeClient && this.isConnected()) {
      this.activeClient.unsubscribe(list);
    }
  }

  /** Get a typed, filtered message stream for a topic (supports `+`/`#` wildcards). */
  public onTopic<T = unknown>(topic: string, options: { throttleMs?: number } = {}): Observable<T> {
    const stream$ = this.messages$.pipe(
      filter((message) => this.matchTopic(message.topic, topic)),
      map((message) => message.payload as T),
    );
    if (!options.throttleMs) {
      return stream$;
    }
    return stream$.pipe(throttleTime(options.throttleMs, undefined, { leading: true, trailing: true }));
  }

  /** Publish a message, JSON-encoding non-string/binary payloads. */
  public publish<T = unknown>(topic: string, payload: T, options: MqttxPublishOptions = {}): Promise<void> {
    const client = this.activeClient;
    if (!client || !this.isConnected()) {
      if (this.activeConfig?.queueOfflineMessages) {
        return this.enqueueOfflineMessage(topic, payload, options);
      }
      return Promise.reject(new Error('MqttxService: cannot publish, client is not connected'));
    }
    return this.sendNow(client, topic, payload, options);
  }

  /** Publish a request and resolve with the first matching response, or reject on timeout. */
  public async publishAndWait<TReq = unknown, TRes = unknown>(
    requestTopic: string,
    responseTopic: string,
    payload: TReq,
    timeoutMs = MQTTX_DEFAULT_REQUEST_TIMEOUT,
  ): Promise<TRes> {
    this.subscribe(responseTopic);
    const response = firstValueFrom(this.onTopic<TRes>(responseTopic).pipe(timeout(timeoutMs)));
    await this.publish(requestTopic, payload);
    return response;
  }

  /** Tears down the active client and completes internal streams. */
  public ngOnDestroy(): void {
    this.disconnect(true);
    this.messageSubject.complete();
    this.errorSubject.complete();
  }

  private createClient(config: MqttxConnectionConfig, abortSignal: AbortSignal): Promise<MqttClient> {
    return new Promise((resolve, reject) => {
      this.status.set('connecting');
      this.reconnectAttempts = 0;
      this.activeConfig = config;
      this.statistics.update((stats) => ({ ...stats, connectionAttempts: stats.connectionAttempts + 1 }));

      const maxAttempts = config.maxReconnectAttempts ?? MQTTX_DEFAULT_MAX_RECONNECT_ATTEMPTS;
      const backoffMultiplier = config.reconnectBackoffMultiplier ?? MQTTX_DEFAULT_RECONNECT_BACKOFF_MULTIPLIER;
      const maxReconnectPeriod = config.maxReconnectPeriod ?? MQTTX_DEFAULT_MAX_RECONNECT_PERIOD;
      const basePeriod = config.reconnectPeriod ?? MQTTX_DEFAULT_RECONNECT_PERIOD;

      this.log('connecting', { url: config.url });
      const client = mqtt.connect(config.url, this.toClientOptions(config));
      this.activeClient = client;

      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      const onAbort = () => {
        if (this.activeClient === client) {
          this.activeClient = null;
        }
        client.removeAllListeners();
        client.end(true);
        settle(() => reject(new Error('MqttxService: connection aborted')));
      };
      abortSignal.addEventListener('abort', onAbort, { once: true });

      client.on('connect', () => {
        abortSignal.removeEventListener('abort', onAbort);
        this.reconnectAttempts = 0;
        client.options.reconnectPeriod = basePeriod;
        this.log('connected', { url: config.url });
        this.handleConnected(this.status() === 'reconnecting');
        settle(() => resolve(client));
      });

      client.on('reconnect', () => {
        this.status.set('reconnecting');
        this.reconnectAttempts++;
        if (this.reconnectAttempts > maxAttempts) {
          const giveUpError = new Error(`MqttxService: giving up after ${maxAttempts} failed reconnect attempts`);
          this.log('giving up', { attempts: this.reconnectAttempts, maxAttempts });
          this.status.set('error');
          this.errorSubject.next(giveUpError);
          client.removeAllListeners();
          client.end(true);
          if (this.activeClient === client) {
            this.activeClient = null;
          }
          settle(() => reject(giveUpError));
          return;
        }
        // Exponential backoff: grow the delay before the *next* attempt, capped at maxReconnectPeriod.
        const nextPeriod = Math.min(
          (client.options.reconnectPeriod ?? basePeriod) * backoffMultiplier,
          maxReconnectPeriod,
        );
        client.options.reconnectPeriod = nextPeriod;
        this.log('reconnecting', { attempt: this.reconnectAttempts, maxAttempts, nextPeriod });
      });

      client.on('close', () => {
        if (this.status() !== 'disconnected' && this.status() !== 'error') {
          this.status.set('disconnected');
          this.statistics.update((stats) => ({ ...stats, lastDisconnectedAt: new Date() }));
          this.log('disconnected');
        }
      });

      client.on('offline', () => {
        this.status.set('offline');
        this.log('offline');
      });

      client.on('error', (error) => {
        this.status.set('error');
        this.statistics.update((stats) => ({ ...stats, failedConnections: stats.failedConnections + 1 }));
        this.errorSubject.next(error);
        this.log('error', error.message);
        settle(() => reject(error));
      });

      client.on('message', (topic, payload, packet) => {
        this.statistics.update((stats) => ({ ...stats, messagesReceived: stats.messagesReceived + 1 }));
        this.messageSubject.next({
          topic,
          payload: this.parsePayload(payload),
          qos: packet.qos,
          retain: !!packet.retain,
          messageId: packet.messageId,
          timestamp: Date.now(),
          raw: payload,
        });
      });
    });
  }

  private toClientOptions(config: MqttxConnectionConfig): IClientOptions {
    const options: IClientOptions = {
      clientId: config.clientId,
      username: config.username,
      password: config.password,
      clean: config.clean,
      keepalive: config.keepAlive,
      reconnectPeriod: config.autoReconnect === false ? 0 : config.reconnectPeriod,
      connectTimeout: config.connectTimeout,
      path: config.path,
      rejectUnauthorized: config.rejectUnauthorized,
      will: config.will
        ? {
            topic: config.will.topic,
            payload:
              typeof config.will.payload === 'string' || config.will.payload instanceof Uint8Array
                ? (config.will.payload as string | Buffer)
                : JSON.stringify(config.will.payload),
            qos: config.will.qos ?? 0,
            retain: config.will.retain ?? false,
          }
        : undefined,
    };
    // mqtt.js merges these options over values it parsed from the broker URL (host/port/path/auth);
    // explicit `undefined` entries would otherwise wipe out that parsed URL data (e.g. the path).
    return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as IClientOptions;
  }

  private handleConnected(wasReconnect: boolean): void {
    this.status.set('connected');
    this.statistics.update((stats) => ({
      ...stats,
      successfulConnections: stats.successfulConnections + 1,
      reconnections: wasReconnect ? stats.reconnections + 1 : stats.reconnections,
      lastConnectedAt: new Date(),
    }));
    this.resubscribeAll();
    this.flushOfflineQueue();
  }

  private sendNow<T>(client: MqttClient, topic: string, payload: T, options: MqttxPublishOptions): Promise<void> {
    const message: string | Buffer =
      typeof payload === 'string' || payload instanceof Uint8Array ? (payload as string | Buffer) : JSON.stringify(payload);
    return client
      .publishAsync(topic, message, {
        qos: options.qos ?? 0,
        retain: options.retain ?? false,
        dup: options.dup ?? false,
      })
      .then(() => {
        this.statistics.update((stats) => ({ ...stats, messagesSent: stats.messagesSent + 1 }));
      });
  }

  private enqueueOfflineMessage<T>(topic: string, payload: T, options: MqttxPublishOptions): Promise<void> {
    const maxQueued = this.activeConfig?.maxQueuedMessages ?? MQTTX_DEFAULT_MAX_QUEUED_MESSAGES;
    if (this.offlineQueue.length >= maxQueued) {
      this.offlineQueue.shift()?.reject(new Error('MqttxService: offline queue overflow, dropping oldest message'));
    }
    this.log('queued offline message', { topic, queued: this.offlineQueue.length + 1 });
    return new Promise((resolve, reject) => {
      this.offlineQueue.push({ topic, payload, options, resolve, reject });
    });
  }

  private rejectOfflineQueue(error: Error): void {
    if (this.offlineQueue.length === 0) {
      return;
    }
    const pending = this.offlineQueue.splice(0, this.offlineQueue.length);
    pending.forEach((entry) => entry.reject(error));
  }

  private flushOfflineQueue(): void {
    if (this.offlineQueue.length === 0) {
      return;
    }
    const client = this.activeClient;
    if (!client) {
      return;
    }
    const pending = this.offlineQueue.splice(0, this.offlineQueue.length);
    this.log('flushing offline queue', { count: pending.length });
    pending.forEach((entry) => {
      this.sendNow(client, entry.topic, entry.payload, entry.options).then(entry.resolve, entry.reject);
    });
  }

  private log(message: string, details?: unknown): void {
    if (this.activeConfig?.debug) {
      // eslint-disable-next-line no-console
      console.debug(`[mqttx] ${message}`, details ?? '');
    }
  }

  private parsePayload(payload: Buffer): unknown {
    const text = payload.toString();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private matchTopic(actual: string, filterTopic: string): boolean {
    if (actual === filterTopic) {
      return true;
    }
    const actualSegments = actual.split('/');
    const filterSegments = filterTopic.split('/');
    for (let i = 0; i < filterSegments.length; i++) {
      const filterSegment = filterSegments[i];
      if (filterSegment === '#') {
        return true;
      }
      if (i >= actualSegments.length) {
        return false;
      }
      if (filterSegment !== '+' && filterSegment !== actualSegments[i]) {
        return false;
      }
    }
    return actualSegments.length === filterSegments.length;
  }

  private generateClientId(): string {
    return `mqttx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
  }

  private resubscribeAll(): void {
    if (!this.activeClient || this.subscriptions.size === 0) {
      return;
    }
    const byQos = new Map<0 | 1 | 2, string[]>();
    this.subscriptions.forEach(({ qos }, topic) => {
      byQos.set(qos, [...(byQos.get(qos) ?? []), topic]);
    });
    byQos.forEach((topics, qos) => this.activeClient?.subscribe(topics, { qos }));
  }
}
