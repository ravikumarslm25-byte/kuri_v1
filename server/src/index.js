import { config } from './config.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { scheduleRetention } from './services/retention.js';

await connectDb(config.mongoUri);
const app = createApp({ web: true });
scheduleRetention();
app.listen(config.port, () => {
  console.log(`Kuri API on :${config.port}  (AI ${config.gemini.apiKey ? 'on: ' + config.gemini.model : 'OFF - fallback fortunes only'})`);
  if (!config.provisionKey) console.warn('KIOSK_PROVISION_KEY not set - kiosks cannot register.');
});
