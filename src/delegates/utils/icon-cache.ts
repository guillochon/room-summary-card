import { getIconResources } from '@delegates/retrievers/icons';
import {
  FALLBACK_DOMAIN_ICONS,
  type CategoryType,
  type ComponentIcons,
  type IconResources,
} from '@hass/data/icon';
import type { HomeAssistant } from '@hass/types';
import type { EntityState } from '@type/room';

/**
 * Cached component icon resources resolved from Home Assistant.
 * Initialized as null; populated after the first successful fetch.
 */
let cachedComponentIcons: Record<string, ComponentIcons> | null = null;

/**
 * Whether a fetch is currently in progress (to avoid duplicate requests).
 */
let fetchInProgress = false;

/**
 * Pre-fetches entity component icon resources from Home Assistant and caches
 * them for synchronous access. Call this early (e.g. when hass is first set)
 * so that subsequent icon lookups are instant.
 *
 * @param hass - The Home Assistant instance
 */
export const prefetchIconResources = (hass: HomeAssistant): void => {
  if (cachedComponentIcons || fetchInProgress) return;

  fetchInProgress = true;
  getIconResources(hass)
    .then((icons: IconResources<CategoryType['entity_component']>) => {
      cachedComponentIcons = icons.resources;
    })
    .catch(() => {
      // Silently fail – icons will use fallback path
    })
    .finally(() => {
      fetchInProgress = false;
    });
};

/**
 * Returns the cached component icon resources, or null if not yet available.
 */
export const getCachedComponentIcons = (): Record<
  string,
  ComponentIcons
> | null => cachedComponentIcons;

/**
 * Helper to find the appropriate icon from component icon translations,
 * supporting both exact state matches and numeric range lookups.
 */
const getIconFromTranslations = (
  state: string | undefined,
  translations:
    | {
        default?: string;
        state?: Record<string, string>;
        range?: Record<string, string>;
      }
    | undefined,
): string | undefined => {
  if (!translations) return undefined;

  // Exact state match
  if (state && translations.state?.[state]) {
    return translations.state[state];
  }

  // Range-based icon for numeric states
  if (state !== undefined && translations.range && !isNaN(Number(state))) {
    const value = Number(state);
    const thresholds = Object.keys(translations.range)
      .map(Number)
      .filter((k) => !isNaN(k))
      .sort((a, b) => a - b);

    if (thresholds.length > 0 && value >= thresholds[0]!) {
      let selected = thresholds[0]!;
      for (const t of thresholds) {
        if (value >= t) selected = t;
        else break;
      }
      return translations.range[selected.toString()];
    }
    return translations.default;
  }

  return translations.default;
};

/**
 * Synchronously resolves the best icon for an entity using cached data.
 *
 * Resolution priority:
 *  1. Entity registry icon (set by user in HA UI)
 *  2. Cached component icons (by device_class or domain default)
 *  3. Fallback domain icons (bundled MDI icon names)
 *
 * @param hass  - The Home Assistant instance
 * @param state - The entity state object
 * @returns The resolved icon string, or undefined if nothing could be determined
 */
export const resolveEntityIcon = (
  hass: HomeAssistant,
  state: EntityState,
): string | undefined => {
  if (!hass || !state) return undefined;

  // 1. Entity registry icon (user-configured override in HA UI)
  const entry = hass.entities?.[state.entity_id];
  if (entry?.icon) {
    return entry.icon;
  }

  // Also check state attributes for icon override
  if (state.attributes?.icon) {
    return state.attributes.icon as string;
  }

  // 2. Cached component icons
  if (cachedComponentIcons) {
    const domainIcons = cachedComponentIcons[state.domain];
    if (domainIcons) {
      const deviceClass = state.attributes?.device_class as string | undefined;
      const translations =
        (deviceClass && domainIcons[deviceClass]) || domainIcons._;

      const icon = getIconFromTranslations(state.state, translations);
      if (icon) return icon;
    }
  }

  // 3. Fallback domain icons
  return FALLBACK_DOMAIN_ICONS[
    state.domain as keyof typeof FALLBACK_DOMAIN_ICONS
  ];
};

/**
 * Resets the icon cache. Primarily used for testing.
 */
export const resetIconCache = (): void => {
  cachedComponentIcons = null;
  fetchInProgress = false;
};
