import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as schema from './schema';

dotenv.config();

const connectionString = process.env.DATABASE_URL || '';

// Connection for queries
export const client = connectionString ? postgres(connectionString) : null;
export const db = client ? drizzle(client, { schema }) : null!;
