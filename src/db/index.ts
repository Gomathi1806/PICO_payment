import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Use a placeholder string during build time if DATABASE_URL is not set on the hosting platform (e.g. Vercel)
const databaseUrl = process.env.DATABASE_URL || 'postgres://placeholder_user:placeholder_pass@localhost:5432/placeholder_db';
const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });
