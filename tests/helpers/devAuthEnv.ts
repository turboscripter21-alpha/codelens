// Imported first by auth tests: local DEV sign-in mode with an in-memory PGlite database.
process.env.DATABASE_URL = "pglite:memory";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
export {};
