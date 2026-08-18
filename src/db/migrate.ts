import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL environment variable is required to run migrations.');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

async function main() {
  console.log('⏳ Aplicando migraciones de base de datos con Drizzle...');
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migraciones aplicadas con éxito.');
  } catch (error) {
    console.error('❌ Error al ejecutar las migraciones:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
