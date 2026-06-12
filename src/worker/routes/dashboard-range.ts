import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { dashboardRangeSetting } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();
const SETTING_ID = 'global';

function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function serialize(row: {
  startDate: string;
  endDate: string;
  isMonthMode: boolean;
  monthBaseDate: string;
}) {
  return {
    start: row.startDate,
    end: row.endDate,
    isMonthMode: row.isMonthMode,
    monthBaseDate: row.monthBaseDate,
  };
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const [row] = await db
    .select()
    .from(dashboardRangeSetting)
    .where(eq(dashboardRangeSetting.id, SETTING_ID));
  if (!row) return c.json(null);
  return c.json(serialize(row));
});

app.put('/', async (c) => {
  const body = await c.req.json<{
    start?: string;
    end?: string;
    isMonthMode?: boolean;
    monthBaseDate?: string;
  }>();

  if (!isValidDateString(body.start) || !isValidDateString(body.end)) {
    return c.json({ error: 'start and end are required' }, 400);
  }
  if (body.start > body.end) {
    return c.json({ error: 'start must be before or equal to end' }, 400);
  }

  const monthBaseDate = isValidDateString(body.monthBaseDate) ? body.monthBaseDate : body.start;
  const isMonthMode = body.isMonthMode === true;
  const db = getDb(c.env.DB);

  const [row] = await db
    .insert(dashboardRangeSetting)
    .values({
      id: SETTING_ID,
      startDate: body.start,
      endDate: body.end,
      isMonthMode,
      monthBaseDate,
    })
    .onConflictDoUpdate({
      target: dashboardRangeSetting.id,
      set: {
        startDate: body.start,
        endDate: body.end,
        isMonthMode,
        monthBaseDate,
        updatedAt: new Date().toISOString(),
      },
    })
    .returning();

  return c.json(serialize(row));
});

export default app;
