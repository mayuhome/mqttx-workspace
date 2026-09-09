export interface MqttxConnectionConfig {
  url: string;
  clientId?: string;
  username?: string;
  password?: string;
  autoReconnect?: boolean;
  reconnectPeriod?: number;
  /** Give up (status becomes 'error') after this many consecutive failed (re)connect attempts. */
  maxReconnectAttempts?: number;
  keepAlive?: number;
  connectTimeout?: number;
  path?: string;
  rejectUnauthorized?: boolean;
  clean?: boolean;
  will?: {
    topic: string;
    payload: any;
    qos?: 0 | 1 | 2;
    retain?: boolean;
  };
}

export type MqttxConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'offline';

export interface MqttxMessage<T = any> {
  topic: string;
  payload: T;
  qos: 0 | 1 | 2;
  retain: boolean;
  messageId?: number;
  timestamp: number;
  raw?: Buffer;
}

export interface MqttxPublishOptions {
  qos?: 0 | 1 | 2;
  retain?: boolean;
  dup?: boolean;
  timeout?: number;
}

export interface MqttxStatistics {
  connectionAttempts: number;
  successfulConnections: number;
  failedConnections: number;
  messagesReceived: number;
  messagesSent: number;
  reconnections: number;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
}
