UPDATE auth.users
SET
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, '')
WHERE email IN (
    'dev.alex@example.com',
    'dev.sam@example.com'
)
RETURNING
    email,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new;