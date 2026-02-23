import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

const MyPreset = definePreset(Aura, {
    primitive: {
        primary: {
            500: '#006280',
            600: '#00556e',
            700: '#00485c',
        },
    },
    semantic: {
        primary: {
            color: '{primary.500}',
            hoverColor: '{primary.600}',
            activeColor: '{primary.700}',
        },
        colorScheme: {
            light: {
                primary: {
                    color: '#006280'
                },
            },
            dark: {
                primary: {
                    color: '#006280'
                },
            }
        },
    },
});

export default MyPreset;
