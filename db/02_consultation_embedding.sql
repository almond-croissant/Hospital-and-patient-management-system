CREATE TABLE IF NOT EXISTS consultation_embedding (
    consultation_id UUID PRIMARY KEY REFERENCES consultation(consultation_id) ON DELETE CASCADE,
    embedding VECTOR(256) NOT NULL
);