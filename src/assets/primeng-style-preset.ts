import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// PrimeNG is a consumer of our app-owned color vocabulary. The palette
// values live in src/styles/_tokens.scss, not in this vendor adapter.
const MyPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: 'var(--palette-primary-50)',
            100: 'var(--palette-primary-100)',
            200: 'var(--palette-primary-200)',
            300: 'var(--palette-primary-300)',
            400: 'var(--palette-primary-400)',
            500: 'var(--palette-primary-500)',
            600: 'var(--palette-primary-600)',
            700: 'var(--palette-primary-700)',
            800: 'var(--palette-primary-800)',
            900: 'var(--palette-primary-900)',
            950: 'var(--palette-primary-950)',
        },
        colorScheme: {
            light: {
                primary: {
                    color: 'var(--color-action-primary)',
                    hoverColor: 'var(--color-action-primary-hover)',
                    activeColor: 'var(--color-action-primary-active)',
                    contrastColor: 'var(--color-action-on-primary)',
                },
                highlight: {
                    background: 'var(--color-surface-selected)',
                    color: 'var(--color-text-primary)',
                },
                formField: {
                    focusBorderColor: 'var(--color-action-primary)',
                },
            },
        },
    },
});

export default MyPreset;
