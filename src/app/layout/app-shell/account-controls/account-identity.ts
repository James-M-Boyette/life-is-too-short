/** Auth metadata is display-only; it is never used for authorization. */
export interface AccountUser {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
}

export function accountIdentity(user: AccountUser | null) {
    const text = (value: unknown): string =>
        typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
    const email = text(user?.email);
    const metadata = user?.user_metadata ?? {};
    const name =
        [
            metadata['full_name'],
            [
                text(metadata['first_name']) || text(metadata['given_name']),
                text(metadata['last_name']) || text(metadata['family_name']),
            ]
                .filter(Boolean)
                .join(' '),
            metadata['name'],
            metadata['display_name'],
        ]
            .map(text)
            .find((value) => value && /\p{L}/u.test(value) && !value.includes('@')) ?? '';
    const parts = name.split(' ');
    const initial = (value: string) => Array.from(value)[0]?.toLocaleUpperCase() ?? '';
    return {
        name,
        email,
        label: name ? parts[0] : email.split('@')[0] || 'Account',
        initials: name
            ? initial(parts[0]) + (parts.length > 1 ? initial(parts[parts.length - 1]) : '')
            : null,
    };
}
