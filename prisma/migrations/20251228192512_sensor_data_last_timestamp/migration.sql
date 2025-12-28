-- AlterTable
ALTER TABLE "sensor_data_last" ALTER COLUMN "timestamp" DROP DEFAULT;

SELECT create_hypertable('sensor_data', 'timestamp', migrate_data => true);

-- Enable compression for better storage efficiency
ALTER TABLE sensor_data SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'device_id'
);

-- Add compression policy: compress data older than 30 days
SELECT add_compression_policy('sensor_data', INTERVAL '30 days');
