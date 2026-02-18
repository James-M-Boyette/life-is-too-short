import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export const authedOnlyGuard: CanMatchFn = () => {
    const auth = inject(AuthStore);
    const router = inject(Router);

    return auth.isAuthed() ? true : router.parseUrl('/login');
};
