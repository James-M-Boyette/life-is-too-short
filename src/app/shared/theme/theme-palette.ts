/**
 * Palette previews are visual options, not different interaction semantics.
 * Color values live exclusively in the root stylesheet.
 */
export const PALETTE_OPTIONS = [
    { id: 'maritime', label: 'Maritime & Coral' },
    { id: 'botanical', label: 'Botanical & Citrus' },
    { id: 'indigo', label: 'Indigo & Copper' },
    { id: 'mediterranean', label: 'Mediterranean' },
    { id: 'ink', label: 'Ink & Marigold' },
] as const;

export type PaletteId = (typeof PALETTE_OPTIONS)[number]['id'];

export const DEFAULT_PALETTE: PaletteId = 'maritime';

export function isPaletteId(value: string): value is PaletteId {
    return PALETTE_OPTIONS.some((option) => option.id === value);
}
