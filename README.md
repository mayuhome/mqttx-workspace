# MQTTX - Enterprise MQTT Client for Angular

[![npm version](https://badge.fury.io/js/mqttx.svg)](https://www.npmjs.com/package/mqttx)
[![build status](https://img.shields.io/github/actions/workflow/status/mayuhome/mqttx-workspace/ci.yml)](https://github.com/mayuhome/mqttx-workspace)
[![coverage](https://img.shields.io/codecov/c/github/mayuhome/mqttx-workspace)](https://codecov.io/gh/mayuhome/mqttx-workspace)
[![license](https://img.shields.io/github/license/mayuhome/mqttx-workspace)](https://github.com/mayuhome/mqttx-workspace/blob/main/LICENSE)

> ⚡ Enterprise MQTT client for Angular with Signals support - 10x development efficiency

## ✨ Features

- 🚀 **Signal-powered** - Reactive state management with Angular Signals
- 🎯 **Type-safe** - Full TypeScript support with generics
- 🔄 **Auto-reconnect** - Smart reconnection with backoff strategy
- 📊 **Multi-broker** - Connect to multiple MQTT brokers simultaneously
- ⚡ **High performance** - Optimized message handling and memory management
- 🛡️ **Enterprise ready** - Production-tested in industrial environments
- 📦 **Zero dependencies** - Only peer dependencies

## 🚀 Quick Start

```typescript
import { MqttxService } from 'mqttx';

@Component({...})
export class MyComponent {
  private mqttx = inject(MqttxService);
  
  constructor() {
    // Connect to broker
    this.mqttx.connect({
      url: 'ws://broker.example.com:9001',
      username: 'user',
      password: 'pass'
    });
    
    // Subscribe to topic
    this.mqttx.onTopic<number>('sensors/temperature')
      .subscribe(temp => console.log(`Temperature: ${temp}°C`));
  }
}
