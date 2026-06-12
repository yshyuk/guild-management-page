export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
};

export type AppEnv = {
  Bindings: Bindings;
};
