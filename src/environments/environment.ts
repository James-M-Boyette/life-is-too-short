export const environment = {
    // Broadcast requires separately authorized database deployment and activation.
    taskSyncMode: 'postgres-changes' as const,
    production: false,
    supabaseUrl: 'https://xvrcqlecgxmttrixvpln.supabase.co',
    supabaseAnonKey: 'sb_publishable_KDk0BLNvEtURDJNzxjbOkg_4fy3gEkv',
};
