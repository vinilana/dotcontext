/**
 * Themed wrappers around @inquirer/prompts that apply the project's promptTheme.
 * The legacy inquirer.prompt() API does not support themes, so these wrappers
 * use @inquirer/prompts directly with the theme pre-applied.
 */
import { select, confirm, input, password, checkbox, Separator } from '@inquirer/prompts';
import { promptTheme } from './theme';

type Choice<V> = {
  value: V;
  name?: string;
  description?: string;
  short?: string;
  disabled?: boolean | string;
  type?: never;
};

export async function themedSelect<V>(config: {
  message: string;
  choices: ReadonlyArray<Separator | Choice<V>>;
  default?: unknown;
  pageSize?: number;
  loop?: boolean;
}): Promise<V> {
  return select<V>({
    ...config,
    theme: promptTheme,
  });
}

export async function themedConfirm(config: {
  message: string;
  default?: boolean;
}): Promise<boolean> {
  return confirm({
    ...config,
    theme: promptTheme,
  });
}

export async function themedInput(config: {
  message: string;
  default?: string;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}): Promise<string> {
  return input({
    ...config,
    theme: promptTheme,
  });
}

export async function themedPassword(config: {
  message: string;
  mask?: string;
}): Promise<string> {
  return password({
    ...config,
    theme: promptTheme,
  });
}

export async function themedCheckbox<V>(config: {
  message: string;
  choices: ReadonlyArray<{ name?: string; value: V; checked?: boolean; disabled?: boolean | string } | Separator>;
  pageSize?: number;
}): Promise<V[]> {
  return checkbox<V>({
    ...config,
    theme: promptTheme,
  });
}

export { Separator };
