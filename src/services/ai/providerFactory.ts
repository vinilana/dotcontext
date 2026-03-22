import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { AIProvider, LLMConfig } from '../../types';

export type ProviderInstance =
  | ReturnType<typeof createOpenAI>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGoogleGenerativeAI>;

export interface ProviderResult {
  provider: ProviderInstance;
  modelId: string;
}

/**
 * Default models for each provider
 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openrouter: 'x-ai/grok-4.1-fast',
  openai: 'gpt-5.2',
  anthropic: 'claude-opus-4.5',
  google: 'gemini-3-flash-preview'
};

/**
 * Environment variable names for API keys
 */
export const PROVIDER_ENV_VARS: Record<AIProvider, string[]> = {
  openrouter: ['OPENROUTER_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']
};

/**
 * Creates a provider instance based on the configuration.
 * OpenRouter uses OpenAI SDK with a custom base URL.
 */
export function createProvider(config: LLMConfig): ProviderResult {
  const { provider, apiKey, baseUrl, model } = config;

  switch (provider) {
    case 'openai':
      return {
        provider: createOpenAI({
          apiKey,
          baseURL: baseUrl
        }),
        modelId: model || DEFAULT_MODELS.openai
      };

    case 'anthropic':
      return {
        provider: createAnthropic({
          apiKey
        }),
        modelId: model || DEFAULT_MODELS.anthropic
      };

    case 'google':
      return {
        provider: createGoogleGenerativeAI({
          apiKey
        }),
        modelId: model || DEFAULT_MODELS.google
      };

    case 'openrouter':
    default:
      // OpenRouter uses OpenAI-compatible API
      return {
        provider: createOpenAI({
          apiKey,
          baseURL: baseUrl || 'https://openrouter.ai/api/v1',
          headers: {
            'HTTP-Referer': 'https://dotcontext.io',
            'X-Title': 'Dotcontext'
          }
        }),
        modelId: model || DEFAULT_MODELS.openrouter
      };
  }
}

/**
 * Detects the provider from available environment variables
 */
export function detectProviderFromEnv(): AIProvider | null {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'google';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  return null;
}

/**
 * Gets the API key for a provider from environment variables
 */
export function getApiKeyFromEnv(provider: AIProvider): string | undefined {
  const envVars = PROVIDER_ENV_VARS[provider];
  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value) return value;
  }
  return undefined;
}

/**
 * Gets the model override from environment for a provider
 */
export function getModelFromEnv(provider: AIProvider): string | undefined {
  const envVarName = `${provider.toUpperCase()}_MODEL`;
  return process.env[envVarName];
}
