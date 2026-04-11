import path from 'node:path';
import type { TargetPreset, PresetName } from './types';
import { getAgentsSyncPresets } from '../shared';

/**
 * Build agent sync presets from the unified tool registry
 */
function buildTargetPresets(): Record<Exclude<PresetName, 'all'>, TargetPreset> {
  const registryPresets = getAgentsSyncPresets();
  const presets: Record<string, TargetPreset> = {};

  for (const [toolId, preset] of Object.entries(registryPresets)) {
    presets[toolId] = {
      name: toolId as PresetName,
      path: preset.path,
      filenameSuffix: preset.filenameSuffix,
      description: preset.description,
    };
  }

  return presets as Record<Exclude<PresetName, 'all'>, TargetPreset>;
}

/**
 * Agent sync presets (derived from tool registry)
 */
export const TARGET_PRESETS: Record<Exclude<PresetName, 'all'>, TargetPreset> = buildTargetPresets();

export function resolvePresets(presetName: PresetName): TargetPreset[] {
  if (presetName === 'all') {
    return Object.values(TARGET_PRESETS);
  }

  const preset = TARGET_PRESETS[presetName];
  return preset ? [preset] : [];
}

export function getPresetByPath(targetPath: string): TargetPreset | undefined {
  const normalizedTarget = path.normalize(path.resolve(targetPath));

  for (const preset of Object.values(TARGET_PRESETS)) {
    const normalizedPreset = path.normalize(path.resolve(preset.path));

    if (normalizedTarget === normalizedPreset ||
        normalizedTarget.startsWith(normalizedPreset + path.sep)) {
      return preset;
    }
  }

  return undefined;
}

export function getAllPresetNames(): PresetName[] {
  return [...Object.keys(TARGET_PRESETS), 'all'] as PresetName[];
}
