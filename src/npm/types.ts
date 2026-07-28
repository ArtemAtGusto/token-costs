/**
 * Pricing data stored for a single model in crawler snapshots.
 */
export interface ModelPricing {
  input?: number;
  output?: number;
  cached?: number;
  cacheWrite?: number;
  context?: number;
  maxOutput?: number;
}

/**
 * Current provider pricing snapshot written by crawlers.
 */
export interface ProviderFile {
  lastUpdatedAt: string;
  perTokenAmount: number;
  models: Record<string, ModelPricing>;
}
