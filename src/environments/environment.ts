export const environment = {
    // API-only bridge; Broadcast cutover and activation require separate approval.
    taskSyncMode: 'api-only' as const,
    production: false,
    supabaseUrl: 'https://xvrcqlecgxmttrixvpln.supabase.co',
    supabaseAnonKey: 'sb_publishable_KDk0BLNvEtURDJNzxjbOkg_4fy3gEkv',
};
