import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { MqttxConnectionConfig } from '../types/mqttx.types';

/**
 * Application-wide default connection config, provided via `provideMqttx()` or manually
 * with `{ provide: MQTTX_CONFIG, useValue: {...} }`. Merged under any config passed to
 * `MqttxService.connect()` / `MqttxFactory.getOrCreate()`.
 */
export const MQTTX_CONFIG = new InjectionToken<MqttxConnectionConfig>('MQTTX_CONFIG');

/** Max concurrently pooled clients for `MqttxFactory` (defaults to `MQTTX_DEFAULT_MAX_POOL_SIZE`). */
export const MQTTX_POOL_SIZE = new InjectionToken<number>('MQTTX_POOL_SIZE');

/** Registers an app-wide default MQTT connection config for `MqttxService`. */
export function provideMqttx(config: MqttxConnectionConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: MQTTX_CONFIG, useValue: config }]);
}
