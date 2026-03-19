import type { TranslateFn } from '../i18n';
import type { AIProvider } from '../../types';
import type { LLMPromptResult } from './types';
import { DEFAULT_MODELS, getApiKeyFromEnv, detectProviderFromEnv } from '../../services/ai/providerFactory';
import { colors, typography } from '../theme';
import { themedSelect, themedConfirm, themedInput, themedPassword, Separator } from '../themedPrompt';

/**
 * Expected API key prefixes for known providers.
 * Used for lightweight format validation (warning only, never blocking).
 */
const API_KEY_PREFIXES: Partial<Record<AIProvider, string>> = {
  openai: 'sk-',
  anthropic: 'sk-ant-'
};

/**
 * Validates an API key format and prints warnings if it looks wrong.
 * Never blocks — just warns the user.
 */
function validateApiKeyFormat(
  apiKey: string,
  provider: AIProvider,
  t: TranslateFn
): void {
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn(typography.warning(t('warnings.apiKey.empty')));
    return;
  }

  const expectedPrefix = API_KEY_PREFIXES[provider];
  if (expectedPrefix && !apiKey.startsWith(expectedPrefix)) {
    console.warn(
      typography.warning(
        t('warnings.apiKey.formatMismatch', { prefix: expectedPrefix, provider })
      )
    );
  }
}

/**
 * Prompts for LLM configuration (provider, model, API key)
 * Shared between fill and plan flows to eliminate duplication
 *
 * Returns null if the user chooses to go back/cancel.
 */
export async function promptLLMConfig(
  t: TranslateFn,
  options: {
    defaultModel?: string;
    skipIfConfigured?: boolean;
  } = {}
): Promise<LLMPromptResult | null> {
  const { defaultModel, skipIfConfigured = true } = options;

  // Check if provider is auto-detected from environment
  const detectedProvider = detectProviderFromEnv();
  const detectedApiKey = detectedProvider ? getApiKeyFromEnv(detectedProvider) : undefined;

  // If configured and skipIfConfigured is true, return auto-detected config
  if (skipIfConfigured && detectedProvider && detectedApiKey) {
    // Validate even auto-detected keys
    validateApiKeyFormat(detectedApiKey, detectedProvider, t);

    return {
      provider: detectedProvider,
      model: defaultModel || DEFAULT_MODELS[detectedProvider],
      apiKey: detectedApiKey,
      autoDetected: true
    };
  }

  // Ask if user wants to configure LLM
  const specifyModel = await themedConfirm({
    message: t('prompts.fill.overrideModel'),
    default: false
  });

  let provider: AIProvider = detectedProvider || 'openrouter';
  let model: string = defaultModel || DEFAULT_MODELS[provider];
  let apiKey: string | undefined = detectedApiKey;

  if (specifyModel) {
    // Provider selection with back option
    const selectedProvider = await themedSelect<AIProvider | '__back__'>({
      message: t('prompts.fill.provider'),
      choices: [
        { name: t('prompts.fill.provider.openrouter'), value: 'openrouter' as const },
        { name: t('prompts.fill.provider.openai'), value: 'openai' as const },
        { name: t('prompts.fill.provider.anthropic'), value: 'anthropic' as const },
        { name: t('prompts.fill.provider.google'), value: 'google' as const },
        new Separator(),
        { name: colors.secondary(t('prompts.llm.back')), value: '__back__' as const }
      ],
      default: provider
    });

    if (selectedProvider === '__back__') {
      return null;
    }
    provider = selectedProvider;

    // Model input
    const modelInput = await themedInput({
      message: t('prompts.fill.model'),
      default: DEFAULT_MODELS[provider]
    });
    model = modelInput.trim();
  }

  // API key prompt if not configured
  if (!apiKey) {
    const provideApiKey = await themedConfirm({
      message: t('prompts.fill.provideApiKey'),
      default: true
    });

    if (provideApiKey) {
      const apiKeyInput = await themedPassword({
        message: t('prompts.fill.apiKey'),
        mask: '*'
      });
      apiKey = apiKeyInput.trim();
    }
  }

  // Validate API key format (warn only)
  if (apiKey) {
    validateApiKeyFormat(apiKey, provider, t);
  }

  return {
    provider,
    model,
    apiKey,
    autoDetected: false
  };
}
