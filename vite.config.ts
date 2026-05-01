import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,  // expose to LAN so your phone can connect
    port: 5173,
    allowedHosts: ['real-keys-live.loca.lt', 'loud-spoons-send.loca.lt', 'chubby-candies-start.loca.lt'],
  },
});
