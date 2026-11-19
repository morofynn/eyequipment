ALTER TABLE limits RENAME TO limits_without_row_ids;
CREATE TABLE limits (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 key TEXT NOT NULL UNIQUE,
 count INTEGER NOT NULL,
 expires INTEGER NOT NULL
);
INSERT INTO limits(key,count,expires) SELECT key,count,expires FROM limits_without_row_ids;
DROP TABLE limits_without_row_ids;
