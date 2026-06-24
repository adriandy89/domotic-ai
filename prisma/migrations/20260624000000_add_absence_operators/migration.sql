-- Add absence/silence operators used by the watchdog (care/wellness rules).
ALTER TYPE "Operation" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "Operation" ADD VALUE IF NOT EXISTS 'STALE';
