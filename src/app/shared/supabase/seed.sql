
-- LOCAL DEVELOPMENT DATA ONLY
-- Run via: pnpm exec supabase db reset --local
-- Never execute this script against hosted production.

-- 1. Create two reproducible Supabase Auth users.
-- These credentials are deliberately synthetic and development-only.
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
)
VALUES
(
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'dev.alex@example.com',
    crypt('LocalTest123!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now()
),
(
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'dev.sam@example.com',
    crypt('LocalTest123!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now()
);

-- Supabase Auth also requires an email identity for each user.
INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data,
    provider, last_sign_in_at, created_at, updated_at
)
SELECT
    gen_random_uuid(),
    u.id,
    u.id::text,
    jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
    ),
    'email',
    now(), now(), now()
FROM auth.users AS u
WHERE u.id IN (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
);

-- 2. Root projects.
INSERT INTO public.projects (id, user_id, name)
VALUES
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Home'),
('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Learning Angular'),
('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Travel'),
('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'Personal');

-- 3. Nested projects (inserted after their parents).
INSERT INTO public.projects (id, user_id, name, parent_project_id)
VALUES
(
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Kitchen',
    '20000000-0000-4000-8000-000000000001'
),
(
    '20000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000002',
    'Italy',
    '20000000-0000-4000-8000-000000000004'
);

-- 4. Tasks.
-- Dates are relative to the reset date, so the dataset remains
-- useful for Today and Upcoming testing in future months.
INSERT INTO public.tasks (
    id, user_id, project_id, title, description,
    is_done, status, planned_date, due_date
)
VALUES
-- Alex: Today
(
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Clean the living room', NULL,
    false, 'todo', current_date, NULL
),
(
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'Review Angular signals', NULL,
    false, 'todo', current_date, current_date + 3
),
-- Alex: Overdue deadline
(
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    'Order replacement cabinet hinge', NULL,
    false, 'todo', NULL, current_date - 2
),
-- Alex: Upcoming
(
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'Practice RxJS operators', NULL,
    false, 'todo', current_date + 2, NULL
),
(
    '30000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    'Compare kitchen paint samples', NULL,
    false, 'todo', current_date + 7, current_date + 10
),
-- Alex: Inbox
(
    '30000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000001',
    NULL,
    'Schedule dentist appointment', NULL,
    false, 'todo', NULL, NULL
),
(
    '30000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000001',
    NULL,
    'Buy groceries', NULL,
    false, 'todo', current_date, NULL
),
-- Alex: Completed
(
    '30000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Replace air filter', NULL,
    true, 'done', current_date - 1, NULL
),
-- Sam: Today
(
    '30000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000004',
    'Research hotels', NULL,
    false, 'todo', current_date, NULL
),
(
    '30000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000005',
    'Go for a walk', NULL,
    false, 'todo', current_date, NULL
),
-- Sam: Upcoming
(
    '30000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000006',
    'Research train tickets', NULL,
    false, 'todo', current_date + 4, current_date + 8
),
(
    '30000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000004',
    'Review itinerary', NULL,
    false, 'todo', current_date + 14, NULL
),
-- Sam: Inbox
(
    '30000000-0000-4000-8000-000000000013',
    '10000000-0000-4000-8000-000000000002',
    NULL,
    'Pick up dry cleaning', NULL,
    false, 'todo', NULL, NULL
),
(
    '30000000-0000-4000-8000-000000000014',
    '10000000-0000-4000-8000-000000000002',
    NULL,
    'Call the bank', NULL,
    false, 'todo', current_date + 1, current_date + 1
),
-- Sam: Overdue and completed
(
    '30000000-0000-4000-8000-000000000015',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000005',
    'Renew library books', NULL,
    false, 'todo', current_date - 3, current_date - 1
),
(
    '30000000-0000-4000-8000-000000000016',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000006',
    'Make travel packing list', NULL,
    true, 'done', current_date - 2, NULL
);
