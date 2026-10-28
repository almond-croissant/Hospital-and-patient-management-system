-- Keep the embedding relation available for installations that applied the
-- original 01_schema.sql without this table. 02_consultation_embedding.sql is
-- retained as a compatibility migration; this file adds the search index.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS CONSULTATION_EMBEDDING (
    consultation_id UUID PRIMARY KEY
        REFERENCES CONSULTATION (consultation_id) ON DELETE CASCADE,
    embedding VECTOR(256) NOT NULL
);

CREATE INDEX IF NOT EXISTS consultation_embedding_hnsw_cosine_idx
    ON CONSULTATION_EMBEDDING
    USING hnsw (embedding vector_cosine_ops);
