import { accountIdentity } from './account-identity';

describe('account identity from display-only Auth metadata', () => {
    it('uses a normalized full name, first-name label and first/last initials', () => {
        expect(accountIdentity({ email: 'ada@example.com', user_metadata: { full_name: '  Ada   Lovelace  ' } }))
            .toEqual({ name: 'Ada Lovelace', label: 'Ada', initials: 'AL', email: 'ada@example.com' });
        expect(accountIdentity({ user_metadata: { given_name: 'Élodie', family_name: 'Durand', first_name: '' } }).initials).toBe('ÉD');
    });
    it('supports a single display name without inventing a surname', () => {
        expect(accountIdentity({ user_metadata: { display_name: '  Prince ' } }))
            .toMatchObject({ name: 'Prince', label: 'Prince', initials: 'P' });
    });
    it('falls back to email with a neutral avatar for empty or malformed metadata', () => {
        expect(accountIdentity({ email: 'james.b@example.com', user_metadata: { full_name: {}, name: '   ', display_name: 'james.b@example.com' } }))
            .toEqual({ name: '', label: 'james.b', initials: null, email: 'james.b@example.com' });
        expect(accountIdentity(null)).toEqual({ name: '', label: 'Account', initials: null, email: '' });
    });
    it('keeps long and international display text without using an external avatar', () => {
        const long = 'Name'.repeat(100);
        expect(accountIdentity({ user_metadata: { full_name: long } }).name).toBe(long);
        expect(accountIdentity({ user_metadata: { full_name: '李 雷' } }).initials).toBe('李雷');
    });
});
