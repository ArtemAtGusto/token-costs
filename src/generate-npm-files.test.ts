import { describe, expect, it } from 'vitest';
import { isSupportedProvider } from './generate-npm-files.js';

describe('generate-npm-files', () => {
  it('accepts the supported crawler providers', () => {
    expect(isSupportedProvider('openai')).toBe(true);
    expect(isSupportedProvider('anthropic')).toBe(true);
    expect(isSupportedProvider('google')).toBe(true);
  });

  it('rejects unsupported providers', () => {
    expect(isSupportedProvider('unsupported')).toBe(false);
  });
});
