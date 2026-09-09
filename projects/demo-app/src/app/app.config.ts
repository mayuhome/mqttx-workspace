import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMqttx } from 'mqttx';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideMqttx({ url: 'wss://broker.emqx.io:8084/mqtt', autoReconnect: true }),
  ],
};
