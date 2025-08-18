-- Development Database Initialization Script
-- This script sets up the basic schema for the unified PIM development environment

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- Create development schemas
CREATE SCHEMA IF NOT EXISTS unified_pim;
CREATE SCHEMA IF NOT EXISTS audit;

-- Set default search path
ALTER DATABASE unified_pim_dev SET search_path TO unified_pim, public;

-- Create basic tables for metadata and audit
CREATE TABLE IF NOT EXISTS unified_pim.platforms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT true,
    config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unified_pim.sync_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_id UUID REFERENCES unified_pim.platforms(id),
    entity_type VARCHAR(50) NOT NULL, -- email, calendar, contact, task, file
    last_sync TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, syncing, completed, failed
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit.operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation VARCHAR(20) NOT NULL, -- create, read, update, delete
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255),
    platform VARCHAR(50),
    user_id VARCHAR(255),
    metadata JSONB,
    execution_time_ms INTEGER,
    status VARCHAR(20) DEFAULT 'success', -- success, error
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default platforms
INSERT INTO unified_pim.platforms (name, enabled) VALUES 
    ('microsoft', true),
    ('google', true),
    ('apple', false) -- Disabled by default for development
ON CONFLICT (name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sync_status_platform ON unified_pim.sync_status(platform_id);
CREATE INDEX IF NOT EXISTS idx_sync_status_entity_type ON unified_pim.sync_status(entity_type);
CREATE INDEX IF NOT EXISTS idx_sync_status_updated ON unified_pim.sync_status(updated_at);

CREATE INDEX IF NOT EXISTS idx_audit_operations_entity ON audit.operations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_operations_platform ON audit.operations(platform);
CREATE INDEX IF NOT EXISTS idx_audit_operations_created ON audit.operations(created_at);

-- Create a trigger to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_platforms_updated_at BEFORE UPDATE ON unified_pim.platforms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_status_updated_at BEFORE UPDATE ON unified_pim.sync_status
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to dev_user
GRANT ALL PRIVILEGES ON SCHEMA unified_pim TO dev_user;
GRANT ALL PRIVILEGES ON SCHEMA audit TO dev_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA unified_pim TO dev_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA audit TO dev_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA unified_pim TO dev_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA audit TO dev_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA unified_pim GRANT ALL PRIVILEGES ON TABLES TO dev_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT ALL PRIVILEGES ON TABLES TO dev_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA unified_pim GRANT ALL PRIVILEGES ON SEQUENCES TO dev_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT ALL PRIVILEGES ON SEQUENCES TO dev_user;