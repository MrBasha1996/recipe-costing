import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import pkg from 'pg'
const { Client } = pkg

const DB_URL = 'postgresql://postgres:Ckia52762622827@db.aadboqtyinjzgshcazfx.supabase.co:5432/postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))

const migrations = [
  join(__dirname, '..', 'supabase', 'migrations', '001_schema.sql'),
  join(__dirname, '..', 'supabase', 'migrations', '002_rls.sql'),
  join(__dirname, '..', 'supabase', 'seed.sql'),
]

async function run() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  console.log('✓ Connected to Supabase PostgreSQL')

  for (const filePath of migrations) {
    const sql = readFileSync(filePath, 'utf8')
    console.log(`\nRunning: ${filePath.split('\\').pop()}`)
    try {
      await client.query(sql)
      console.log(`✓ Done`)
    } catch (err) {
      console.error(`✗ Error:`, err.message)
      await client.end()
      process.exit(1)
    }
  }

  await client.end()
  console.log('\n✅ All migrations complete!')
}

run().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
