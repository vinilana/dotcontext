import type { TranslateFn } from '../i18n';
import type { InteractiveMode, AnalysisOptions } from './types';
import { themedSelect, themedConfirm, themedCheckbox, Separator } from '../themedPrompt';
import { colors } from '../theme';

// Re-export types
export * from './types';

// Re-export modules
export { detectSmartDefaults, getConfiguredProviders, hasAnyProviderConfigured } from './smartDefaults';
export { promptLLMConfig } from './llmPrompts';
export { displayConfigSummary } from './configSummary';

/**
 * Prompts user to choose between quick and advanced mode
 */
export async function promptInteractiveMode(t: TranslateFn): Promise<InteractiveMode> {
  return themedSelect<InteractiveMode>({
    message: t('prompts.mode.select'),
    choices: [
      { name: t('prompts.mode.quick'), value: 'quick' },
      { name: t('prompts.mode.advanced'), value: 'advanced' }
    ],
    default: 'quick'
  });
}

/**
 * Prompts for analysis options (semantic, languages, LSP)
 *
 * Returns null if the user chooses to go back/cancel.
 */
export async function promptAnalysisOptions(
  t: TranslateFn,
  defaults: { languages?: string[]; useLsp?: boolean } = {}
): Promise<AnalysisOptions | null> {
  // Use a select instead of confirm so we can offer a back option
  const semanticChoice = await themedSelect<'yes' | 'no' | '__back__'>({
    message: t('prompts.fill.semantic'),
    choices: [
      { name: 'Yes', value: 'yes' },
      { name: 'No', value: 'no' },
      new Separator(),
      { name: colors.secondary(t('prompts.analysis.back')), value: '__back__' }
    ],
    default: 'yes'
  });

  if (semanticChoice === '__back__') {
    return null;
  }

  const useSemantic = semanticChoice === 'yes';
  let languages: string[] | undefined;
  let useLsp = false;

  if (useSemantic) {
    const defaultLanguages = defaults.languages || ['typescript', 'javascript', 'python'];
    const selectedLanguages = await themedCheckbox<string>({
      message: t('prompts.fill.languages'),
      choices: [
        { name: 'TypeScript', value: 'typescript', checked: defaultLanguages.includes('typescript') },
        { name: 'JavaScript', value: 'javascript', checked: defaultLanguages.includes('javascript') },
        { name: 'Python', value: 'python', checked: defaultLanguages.includes('python') }
      ]
    });
    languages = selectedLanguages.length > 0 ? selectedLanguages : undefined;

    useLsp = await themedConfirm({
      message: t('prompts.fill.useLsp'),
      default: defaults.useLsp ?? false
    });
  }

  const verbose = await themedConfirm({
    message: t('prompts.common.verbose'),
    default: false
  });

  return {
    semantic: useSemantic,
    languages,
    useLsp,
    verbose
  };
}

/**
 * Prompts for confirmation before proceeding
 */
export async function promptConfirmProceed(t: TranslateFn): Promise<boolean> {
  return themedConfirm({
    message: t('prompts.summary.proceed'),
    default: true
  });
}

/**
 * Prompts user to load environment variables from .env file
 */
export async function promptLoadEnv(t: TranslateFn): Promise<boolean> {
  return themedConfirm({
    message: t('prompts.env.loadEnv'),
    default: false
  });
}
