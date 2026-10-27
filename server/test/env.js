// Imported first by every test file: configures an isolated in-memory database and test credentials.
process.env.NODE_ENV = 'test';
process.env.PGLITE_DATA_DIR = 'memory';
process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.ADMIN_EMAIL = 'admin@skilllens.test';
process.env.ADMIN_PASSWORD = 'admin-password-for-tests';
process.env.DEMO_STUDENT_EMAIL = '';
process.env.DEMO_STUDENT_PASSWORD = '';
process.env.SEED_DEMO_DATA = 'true';
