export const AnalysisTypeOptions = {
  COORDINATES_ANALYSIS: 'coordinates-analysis',
  AVERAGE_SPEED_BY_HOUR: 'average-speed-by-hour',
} as const;

export type AnalysisTypes =
  (typeof AnalysisTypeOptions)[keyof typeof AnalysisTypeOptions];

export const ANALYSIS_TYPE = Object.values(
  AnalysisTypeOptions,
) as AnalysisTypes[];
