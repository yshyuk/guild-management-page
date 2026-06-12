import { Hono } from 'hono';
import type { AppEnv } from './types';
import members from './routes/members';
import missLogs from './routes/miss-logs';
import guildWarPeriods from './routes/guild-war-periods';
import raidDeadlines from './routes/raid-deadlines';
import dashboardRange from './routes/dashboard-range';
import warnings from './routes/warnings';
import scoreSeasons from './routes/score-seasons';
import scores from './routes/scores';

const app = new Hono<AppEnv>();

const api = new Hono<AppEnv>();
api.route('/members', members);
api.route('/miss-logs', missLogs);
api.route('/guild-war-periods', guildWarPeriods);
api.route('/raid-deadlines', raidDeadlines);
api.route('/dashboard-range', dashboardRange);
api.route('/warnings', warnings);
api.route('/score-seasons', scoreSeasons);
api.route('/scores', scores);

api.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.route('/api', api);

// 그 외 모든 요청은 정적 SPA 자산으로 위임 (vite-plugin이 ASSETS 바인딩 주입)
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
