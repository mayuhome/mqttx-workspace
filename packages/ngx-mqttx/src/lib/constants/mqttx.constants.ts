import { MqttxConnectionConfig } from '../types/mqttx.types';

/** Default reconnect period (ms) used by the underlying mqtt.js client. */
export const MQTTX_DEFAULT_RECONNECT_PERIOD = 4000;

/** Default connection timeout (ms) before a connect attempt fails. */
export const MQTTX_DEFAULT_CONNECT_TIMEOUT = 30000;

/** Default MQTT keep-alive interval (seconds). */
export const MQTTX_DEFAULT_KEEP_ALIVE = 60;

/** Default replay buffer size for the `messages$` stream. */
export const MQTTX_MESSAGE_BUFFER_SIZE = 100;

/** Default timeout (ms) for `publishAndWait`. */
export const MQTTX_DEFAULT_REQUEST_TIMEOUT = 10000;

/** Default cap on consecutive failed (re)connect attempts before giving up. */
export const MQTTX_DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;

/** Default multiplier applied to `reconnectPeriod` after each failed reconnect attempt. */
export const MQTTX_DEFAULT_RECONNECT_BACKOFF_MULTIPLIER = 1.5;

/** Default upper bound (ms) for the backed-off reconnect period. */
export const MQTTX_DEFAULT_MAX_RECONNECT_PERIOD = 30000;

/** Default cap on offline-queued messages awaiting flush on reconnect. */
export const MQTTX_DEFAULT_MAX_QUEUED_MESSAGES = 100;

/** Default cap on concurrently pooled clients in `MqttxFactory` (LRU-evicted beyond this). */
export const MQTTX_DEFAULT_MAX_POOL_SIZE = 20;

/** Library-level defaults merged (lowest priority) into every connection config. */
export const MQTTX_DEFAULT_CONFIG: Partial<MqttxConnectionConfig> = {
  autoReconnect: true,
  reconnectPeriod: MQTTX_DEFAULT_RECONNECT_PERIOD,
  keepAlive: MQTTX_DEFAULT_KEEP_ALIVE,
  connectTimeout: MQTTX_DEFAULT_CONNECT_TIMEOUT,
  clean: true,
  maxReconnectAttempts: MQTTX_DEFAULT_MAX_RECONNECT_ATTEMPTS,
  reconnectBackoffMultiplier: MQTTX_DEFAULT_RECONNECT_BACKOFF_MULTIPLIER,
  maxReconnectPeriod: MQTTX_DEFAULT_MAX_RECONNECT_PERIOD,
  queueOfflineMessages: false,
  maxQueuedMessages: MQTTX_DEFAULT_MAX_QUEUED_MESSAGES,
  debug: false,
};
