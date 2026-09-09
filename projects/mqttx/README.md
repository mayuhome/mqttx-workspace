# mqttx

Angular-native wrapper around [mqtt.js](https://github.com/mqttjs/MQTT.js), built with Angular's
Signals and `resource()` APIs. It gives you a fully reactive MQTT client: connection status,
statistics and messages are exposed as signals, while connecting/reconnecting is driven by a
`resource()` so the underlying `MqttClient` is created and torn down automatically whenever the
connection config changes.

Compatible with Angular `^22.1.0`.

## Installation

```bash
npm install mqttx mqtt
```

`mqtt` is a peer dependency and must be installed alongside this package.

## Quick start

```ts
import { Component, inject } from '@angular/core';
import { MqttxService } from 'mqttx';

@Component({ ... })
export class DashboardComponent {
  private readonly mqttx = inject(MqttxService);

  constructor() {
    this.mqttx.connect({ url: 'wss://broker.example.com:8084/mqtt', username: 'demo', password: 'demo' });
    this.mqttx.subscribe('devices/+/status', { qos: 1 });
  }

  // Signals - read directly in templates, no async pipe needed.
  readonly status = this.mqttx.connectionStatus;
  readonly isConnected = this.mqttx.isConnected;
  readonly stats = this.mqttx.statistics$;

  // Typed, filtered message stream (still an Observable, for RxJS composition).
  readonly deviceStatus$ = this.mqttx.onTopic<{ online: boolean }>('devices/+/status');
}
```

Provide an app-wide default connection config (merged under any config passed to `connect()`):

```ts
import { provideMqttx } from 'mqttx';

export const appConfig: ApplicationConfig = {
  providers: [
    provideMqttx({ url: 'wss://broker.example.com:8084/mqtt', autoReconnect: true }),
  ],
};
```

## API

### `MqttxService`

Injectable, `providedIn: 'root'` singleton. Connection lifecycle is modeled with `resource()`:
calling `connect()` writes a new config signal, which the resource picks up to (re)create the
`MqttClient`; `disconnect()` clears it, tearing the client down.

| Member | Description |
| --- | --- |
| `connectionStatus: Signal<MqttxConnectionStatus>` | `'disconnected' \| 'connecting' \| 'connected' \| 'reconnecting' \| 'offline' \| 'error'` |
| `isConnected: Signal<boolean>` | Derived from `connectionStatus` |
| `isConnecting: Signal<boolean>` | True while connecting or reconnecting |
| `connectionError: Signal<Error \| undefined>` | Error from the current `resource()` load, if any |
| `statistics$: Signal<MqttxStatistics>` | Connection/message counters |
| `errors$: Observable<Error>` | Runtime client errors |
| `messages$: Observable<MqttxMessage>` | Raw message stream (replayed to late subscribers) |
| `connect(config)` | (Re)connect using the given config, merged over library/app defaults |
| `disconnect(force?)` | Disconnect and tear down the current client |
| `subscribe(topics, { qos })` | Subscribe now (and automatically re-subscribe on reconnect) |
| `unsubscribe(topics)` | Unsubscribe and forget the topic |
| `onTopic<T>(topic, { throttleMs })` | Typed, wildcard-aware (`+`/`#`) message `Observable<T>` |
| `publish<T>(topic, payload, options)` | Publish; non-string/Buffer payloads are JSON-encoded |
| `publishAndWait<TReq, TRes>(reqTopic, resTopic, payload, timeoutMs)` | Request/response over MQTT |

### `MqttxFactory`

For apps that need multiple broker connections at once, `MqttxFactory` creates and tracks named,
independent `MqttxService` instances (separate client, subscriptions and state per name).

```ts
const factory = inject(MqttxFactory);
const primary = factory.getOrCreate('primary', { url: 'wss://broker-a.example.com/mqtt' });
const secondary = factory.getOrCreate('secondary', { url: 'wss://broker-b.example.com/mqtt' });
factory.remove('secondary');
factory.disconnectAll();
```

### Tokens & config

- `MQTTX_CONFIG` — `InjectionToken<MqttxConnectionConfig>` for an app-wide default config.
- `provideMqttx(config)` — convenience `EnvironmentProviders` for `MQTTX_CONFIG`.
- `MqttxConnectionConfig`, `MqttxConnectionStatus`, `MqttxMessage<T>`, `MqttxPublishOptions`,
  `MqttxStatistics` — public types, see [types/mqttx.types.ts](src/lib/types/mqttx.types.ts).

## Building

To build the library, run:

```bash
ng build mqttx
```

This command will compile your project, and the build artifacts will be placed in the `dist/` directory.

### Publishing the Library

Once the project is built, you can publish your library by following these steps:

1. Navigate to the `dist` directory:

   ```bash
   cd dist/mqttx
   ```

2. Run the `npm publish` command to publish your library to the npm registry:
   ```bash
   npm publish
   ```

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test mqttx
```
