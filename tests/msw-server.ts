import { setupServer } from 'msw/node';

/** Per-test handlers are added with server.use(...). Unhandled requests fail the test. */
export const server = setupServer();
export const API = 'http://localhost:8000/api/v1';
