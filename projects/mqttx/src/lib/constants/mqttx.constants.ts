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

/** Library-level defaults merged (lowest priority) into every connection config. */
export const MQTTX_DEFAULT_CONFIG: Partial<MqttxConnectionConfig> = {
  autoReconnect: true,
  reconnectPeriod: MQTTX_DEFAULT_RECONNECT_PERIOD,
  keepAlive: MQTTX_DEFAULT_KEEP_ALIVE,
  connectTimeout: MQTTX_DEFAULT_CONNECT_TIMEOUT,
  clean: true,
  maxReconnectAttempts: MQTTX_DEFAULT_MAX_RECONNECT_ATTEMPTS,
};
