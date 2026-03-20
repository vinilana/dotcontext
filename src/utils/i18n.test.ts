import { detectLocale, normalizeLocale } from './i18n';

describe('i18n locale detection', () => {
  it('normalizes system locale variants to supported locales', () => {
    expect(normalizeLocale('pt_BR.UTF-8')).toBe('pt-BR');
    expect(normalizeLocale('en_US.UTF-8')).toBe('en');
  });

  it('prefers explicit CLI flags over environment detection', () => {
    expect(detectLocale(['--lang', 'en'], 'pt-BR', ['pt_BR.UTF-8'])).toBe('en');
  });

  it('falls back to AI_CONTEXT_LANG before OS locale', () => {
    expect(detectLocale([], 'pt-BR', ['en_US.UTF-8'])).toBe('pt-BR');
  });

  it('detects supported locales from OS locale variables', () => {
    expect(detectLocale([], null, ['pt_BR.UTF-8'])).toBe('pt-BR');
    expect(detectLocale([], null, ['C', 'en_US.UTF-8'])).toBe('en');
  });
});
