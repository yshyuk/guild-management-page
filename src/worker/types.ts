export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  // wrangler secret (로컬은 .dev.vars)
  VIEWER_PASSWORD: string;
  ADMIN_PASSWORD: string;
  AUTH_SECRET: string;
};

export type Role = 'viewer' | 'admin';

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    role: Role;
  };
};
