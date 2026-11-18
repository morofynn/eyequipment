CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS confirmations (
 token_hash TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL,
 email_hash TEXT NOT NULL,
 consent_version TEXT NOT NULL,
 created INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',
 lease INTEGER NOT NULL DEFAULT 0,
 confirmed INTEGER
);
CREATE INDEX IF NOT EXISTS confirmations_email ON confirmations(email_hash);
