function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatNavigationExcerpt(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const navigation = data.navigation ?? data;
  if (typeof navigation === 'string' && navigation.trim().length > 0) {
    return navigation.trim();
  }

  try {
    const serialized = JSON.stringify(navigation, null, 2);
    return serialized.length > 4000
      ? `${serialized.slice(0, 4000)}\n…`
      : serialized;
  } catch {
    return undefined;
  }
}
