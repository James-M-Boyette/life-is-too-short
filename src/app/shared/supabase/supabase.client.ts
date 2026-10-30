import { InjectionToken } from '@angular/core';
import { createClient } from '@supabase/supabase-js';

import { environment } from '@/environments/environment';

export const supabase = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
);

export const SUPABASE_CLIENT = new InjectionToken<typeof supabase>(
    'SUPABASE_CLIENT',
    {
        providedIn: 'root',
        factory: () => supabase,
    },
);
