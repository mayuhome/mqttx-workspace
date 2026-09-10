# MQTTX 🚀

[![npm version](https://img.shields.io/npm/v/mqttx.svg?style=flat-square)](https://www.npmjs.com/package/mqttx)
[![npm downloads](https://img.shields.io/npm/dm/mqttx.svg?style=flat-square)](https://www.npmjs.com/package/mqttx)
[![license](https://img.shields.io/npm/l/mqttx.svg?style=flat-square)](https://github.com/mayuhome/mqttx-workspace/blob/main/LICENSE)
[![Angular](https://img.shields.io/badge/Angular-19%2B-DD0031.svg?style=flat-square&logo=angular)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

> **Enterprise-grade, Signal-driven MQTT Client for modern Angular applications.**

`mqttx` is a reactive Angular wrapper around [MQTT.js](https://github.com/mqttjs/MQTT.js) built specifically for Angular 19+ using **Angular Signals** and the **`resource()`** API. It provides seamless signal integration for UI reactivity, smart exponential reconnection backoff, offline message queueing, typed wildcard topic streams, and multi-broker connection pooling.

---

## 🌟 Key Features

- ⚡ **Angular Signals Native**: Connection state, flags, errors, and statistics exposed directly as signals — zero boilerplate, no async pipe required in templates.
- 🔄 **Reactive Lifecycle (`resource()`)**: Connecting, switching configurations, and tearing down clients is driven reactively by Angular's resource API.
- 📈 **Exponential Reconnection Backoff**: Configurable backoff multipliers, max reconnection caps, and fail-safe error states — no infinite reconnect loops.
- 📦 **Offline Message Queueing**: Queue outgoing messages while disconnected, automatically flushing them upon successful reconnection.
- 🎯 **Type-safe & Wildcard Streams**: RxJS `onTopic<T>()` with full support for MQTT single-level (`+`) and multi-level (`#`) wildcards, plus built-in throttling.
- 🏭 **Multi-Broker Connection Pool (`MqttxFactory`)**: Manage multiple independent broker connections with automatic LRU (Least Recently Used) client eviction.
- 📨 **Request-Response Pattern**: Built-in `publishAndWait<TReq, TRes>()` for async RPC-style messaging over MQTT.
- 🪵 **Built-in Debug Logger**: Inspect connection lifecycle transitions in `console.debug`.

---

## 📦 Installation

```bash
# Using npm
npm install mqttx mqtt

# Using pnpm
pnpm add mqttx mqtt

# Using yarn
yarn add mqttx mqtt
```

> **Requirements:** Angular `>= 19.0.0` and RxJS `>= 7.4.0`.

---

## 🚀 Quick Start

### 1. Global Configuration (Optional)

Provide an application-wide default connection configuration using `provideMqttx()` in your `app.config.ts`:

```typescript
// app.config.ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideMqttx } from 'mqttx';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Configure default broker settings
    provideMqttx({
      url: 'wss://broker.emqx.io:8084/mqtt',
      clientId: 'angular_client_' + Math.random().toString(16).substring(2, 8),
      autoReconnect: true,
      queueOfflineMessages: true,
      debug: false,
    }),
  ],
};
```

### 2. In Your Component / Service

Inject `MqttxService` to connect, monitor state with Signals, and consume typed streams:

```typescript
// dashboard.component.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MqttxService } from 'mqttx';

interface DeviceTelemetry {
  deviceId: string;
  temperature: number;
  humidity: number;
  timestamp: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mqtt-card">
      <h3>MQTT Status: {{ status() }}</h3>
      <span [class.online]="isConnected()" [class.offline]="!isConnected()">
        {{ isConnected() ? 'Online' : 'Offline' }}
      </span>

      <div class="stats">
        <p>Sent: {{ stats().messagesSent }} | Received: {{ stats().messagesReceived }}</p>
      </div>

      <button (click)="sendControlCommand()">Send Ping</button>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly mqttx = inject(MqttxService);

  // Read signals directly in templates
  readonly status = this.mqttx.connectionStatus;
  readonly isConnected = this.mqttx.isConnected;
  readonly isConnecting = this.mqttx.isConnecting;
  readonly stats = this.mqttx.statistics$;

  ngOnInit(): void {
    // 1. Connect to broker (overrides or supplements provideMqttx settings)
    this.mqttx.connect({
      url: 'wss://broker.emqx.io:8084/mqtt',
      username: 'user',
      password: 'password',
    });

    // 2. Subscribe to topic with wildcards (+ / #) and type safety
    this.mqttx.onTopic<DeviceTelemetry>('devices/+/telemetry', { throttleMs: 200 })
      .subscribe((data) => {
        console.log(`Device [${data.deviceId}] Temp: ${data.temperature}°C`);
      });
  }

  // 3. Publish message
  async sendControlCommand() {
    await this.mqttx.publish('devices/room1/commands', {
      action: 'PING',
      sentAt: Date.now(),
    }, { qos: 1 });
  }
}
```

---

## 📖 In-Depth Usage

### Reconnection Backoff & Offline Queueing

```typescript
this.mqttx.connect({
  url: 'wss://broker.example.com:8084/mqtt',
  autoReconnect: true,
  reconnectPeriod: 2000,          // Base reconnect interval (2s)
  reconnectBackoffMultiplier: 1.5, // 2s -> 3s -> 4.5s -> ...
  maxReconnectPeriod: 30000,      // Max reconnect delay capped at 30s
  maxReconnectAttempts: 10,       // Stop and mark status as 'error' after 10 failures
  queueOfflineMessages: true,     // Hold publish() calls when offline
  maxQueuedMessages: 200,         // Max queued offline messages (oldest dropped first)
  debug: true,                    // Detailed lifecycle logs in console.debug
});
```

### Request-Response Pattern (`publishAndWait`)

Send a request on one topic and wait for the correlated response on another:

```typescript
try {
  const result = await this.mqttx.publishAndWait<
    { query: string },
    { status: string; result: string[] }
  >(
    'devices/device-01/query',      // Request topic
    'devices/device-01/response',   // Response topic
    { query: 'STATUS_ALL' },
    5000                            // Timeout in ms (default: 10000)
  );

  console.log('Received response:', result);
} catch (error) {
  console.error('Request timed out or failed', error);
}
```

### Multi-Broker Connections (`MqttxFactory`)

When your application communicates with multiple distinct MQTT brokers simultaneously, use `MqttxFactory`:

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { MqttxFactory } from 'mqttx';

@Component({ ... })
export class MultiBrokerComponent implements OnInit {
  private readonly factory = inject(MqttxFactory);

  ngOnInit(): void {
    // Dedicated client for IoT telemetry
    const iotClient = this.factory.getOrCreate('iotBroker', {
      url: 'wss://iot-broker.example.com:8084/mqtt',
    });
    iotClient.onTopic('sensors/#').subscribe(data => console.log('IoT:', data));

    // Dedicated client for chat/notifications
    const chatClient = this.factory.getOrCreate('chatBroker', {
      url: 'wss://chat-broker.example.com:8084/mqtt',
    });
    chatClient.onTopic('room/general').subscribe(msg => console.log('Chat:', msg));
  }
}
```

Configure max pool size using the `MQTTX_POOL_SIZE` injection token (default is 20):

```typescript
import { MQTTX_POOL_SIZE } from 'mqttx';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: MQTTX_POOL_SIZE, useValue: 50 },
  ],
};
```

---

## 📚 API Reference

### `MqttxService`

Injectable singleton (`providedIn: 'root'`) managing a reactive connection session.

#### Signals & Observables
| Member | Type | Description |
|---|---|---|
| `connectionStatus` | `Signal<MqttxConnectionStatus>` | `'disconnected' \| 'connecting' \| 'connected' \| 'reconnecting' \| 'error' \| 'offline'` |
| `isConnected` | `Signal<boolean>` | `true` when `connectionStatus === 'connected'` |
| `isConnecting` | `Signal<boolean>` | `true` when status is `'connecting'` or `'reconnecting'` |
| `connectionError` | `Signal<Error \| undefined>` | The error from the current `resource()` load, if any |
| `statistics$` | `Signal<MqttxStatistics>` | Real-time connection and message counters |
| `errors$` | `Observable<Error>` | Stream of client errors |
| `messages$` | `Observable<MqttxMessage>` | Replay stream of all received raw messages |

#### Methods
| Method | Description |
|---|---|
| `connect(config: MqttxConnectionConfig): void` | Connect or reconnect with new configuration. |
| `disconnect(force?: boolean): Promise<void>` | Disconnect and tear down client. |
| `subscribe(topics: string \| string[], options?: { qos?: 0 \| 1 \| 2 }): void` | Subscribe to topics (auto-resubscribed on reconnect). |
| `unsubscribe(topics: string \| string[]): void` | Unsubscribe from specified topic(s). |
| `onTopic<T>(topic: string, options?: { throttleMs?: number }): Observable<T>` | Stream messages matching the topic or pattern (`+`, `#`). |
| `publish<T>(topic: string, payload: T, options?: MqttxPublishOptions): Promise<void>` | Publish message. Auto JSON-encodes objects. |
| `publishAndWait<TReq, TRes>(reqTopic: string, resTopic: string, payload: TReq, timeoutMs?: number): Promise<TRes>` | Send request and await response. |

---

### `MqttxConnectionConfig`

| Property | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | *(required)* | WebSocket or TCP broker URL (e.g. `wss://broker:8084/mqtt`). |
| `clientId` | `string` | Auto-generated | MQTT client identifier. |
| `username` | `string` | `undefined` | Authentication username. |
| `password` | `string` | `undefined` | Authentication password. |
| `autoReconnect` | `boolean` | `true` | Automatically reconnect on connection drop. |
| `reconnectPeriod` | `number` | `4000` | Initial reconnect period (ms). |
| `maxReconnectAttempts`| `number` | `10` | Max consecutive reconnect attempts before giving up. |
| `reconnectBackoffMultiplier` | `number` | `1.5` | Exponential multiplier applied per failed attempt. |
| `maxReconnectPeriod` | `number` | `30000` | Maximum reconnect interval cap (ms). |
| `queueOfflineMessages`| `boolean` | `false` | Queue `publish()` calls while offline. |
| `maxQueuedMessages` | `number` | `100` | Maximum queued offline messages capacity. |
| `keepAlive` | `number` | `60` | MQTT keep-alive timer in seconds. |
| `connectTimeout` | `number` | `30000` | Connection timeout in milliseconds. |
| `clean` | `boolean` | `true` | Clean session flag. |
| `will` | `object` | `undefined` | Last Will and Testament (LWT) payload and topic. |
| `debug` | `boolean` | `false` | Enable console debug logs for lifecycle events. |

---

## 🛠️ Development & Building

```bash
# Build library
pnpm run build:lib

# Run library unit tests (watch mode)
pnpm run test:lib

# Run library unit tests once (CI mode)
pnpm run test:lib:ci

# Run demo application
pnpm run start
```

---

## 📄 License

[MIT](LICENSE) © [mayuhome](https://github.com/mayuhome)
