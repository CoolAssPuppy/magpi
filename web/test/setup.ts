import '@testing-library/jest-dom/vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:55321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SB_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
