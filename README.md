# ngx-mqttx - Enterprise MQTT Client for Angular

[![npm version](https://img.shields.io/npm/v/ngx-mqttx.svg?style=flat-square)](https://www.npmjs.com/package/ngx-mqttx)
[![build status](https://img.shields.io/github/actions/workflow/status/mayuhome/mqttx-workspace/ci.yml?branch=main&style=flat-square)](https://github.com/mayuhome/mqttx-workspace)
[![license](https://img.shields.io/npm/l/ngx-mqttx.svg?style=flat-square)](https://github.com/mayuhome/mqttx-workspace/blob/main/LICENSE)
[![Angular](https://img.shields.io/badge/Angular-19%2B-DD0031.svg?style=flat-square&logo=angular)](https://angular.dev/)

> ⚡ Enterprise-grade, Signal-driven MQTT Client for modern Angular applications.

## ✨ Features

- 🚀 **Signal-powered** - Reactive state management with Angular Signals (`isConnected`, `connectionStatus`, `statistics$`, `isConnecting`)
- 🔄 **Reactive Resource Lifecycle** - Automatic client lifecycle management powered by Angular's `resource()` API
- 📈 **Smart Exponential Backoff** - Configurable reconnection backoff multiplier and maximum retry caps
- 📦 **Offline Message Queueing** - Automatically queue offline `publish()` calls and flush upon reconnect
- 🎯 **Type-safe & Wildcards** - Full TypeScript generics with MQTT single-level (`+`) and multi-level (`#`) wildcard filtering
- 📊 **Multi-Broker Connection Pool** - Manage multiple broker connections with LRU eviction (`MqttxFactory`)
- 📨 **Request-Response Pattern** - Async RPC with `publishAndWait<TReq, TRes>()`
- 🛡️ **Zero Runtime Bloat** - Clean architecture wrapping `mqtt.js`

---

## 🚀 Quick Start

### 1. Installation

```bash
pnpm add ngx-mqttx mqtt
# or
npm install ngx-mqttx mqtt
```

### 2. Configure in `app.config.ts`

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideMqttx } from 'ngx-mqttx';

export const appConfig: ApplicationConfig = {
  providers: [
    provideMqttx({
      url: 'wss://broker.emqx.io:8084/mqtt',
      autoReconnect: true,
      queueOfflineMessages: true,
    }),
  ],
};
```

### 3. Use in Component

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { MqttxService } from 'ngx-mqttx';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <div>Status: {{ status() }}</div>
    <div *ngIf="isConnected()">Connected!</div>
  `,
})
export class AppComponent implements OnInit {
  private readonly mqttx = inject(MqttxService);

  readonly status = this.mqttx.connectionStatus;
  readonly isConnected = this.mqttx.isConnected;

  ngOnInit() {
    this.mqttx.connect({ url: 'wss://broker.emqx.io:8084/mqtt' });

    this.mqttx.onTopic<{ temp: number }>('sensors/+/temp')
      .subscribe((data) => console.log('Sensor temperature:', data.temp));
  }
}
```

---

## 📂 Project Structure

This monorepo is managed with **pnpm Workspaces**, **Turborepo**, and **Changesets**:

- `packages/ngx-mqttx/`: The core Angular library source code.
- `apps/demo-app/`: Interactive Angular demo & testing application.
- *(Future)* `packages/core/`, `packages/vue-mqttx/`, `packages/react-mqttx/`: Multi-framework packages.

---

## 🛠️ Development & Monorepo Workflow

```bash
# Install dependencies
pnpm install

# Build all packages with Turborepo
pnpm run build

# Run library tests (CI mode)
pnpm run test:lib:ci

# Start demo app
pnpm run start

# Release / Versioning
pnpm release:alpha  # Or: pnpm changeset
```

---

## 📄 License

[MIT](LICENSE) © [mayuhome](https://github.com/mayuhome)
