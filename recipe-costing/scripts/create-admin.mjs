import pkg from 'pg'
const { Client } = pkg

const SUPABASE_URL = 'https://aadboqtyinjzgshcazfx.supabase.co'
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhZGJvcXR5aW5qemdzaGNhemZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTAyMDc1NSwiZXhwIjoyMDk0NTk2NzU1fQ.tKdnjp8XhF8Ja2s3rfvb2pHBR8TwWIWQ8TbTCLK6E6s'
const DB_URL = 'postgresql://postgres:Ckia52762622827@db.aadboqtyinjzgshcazfx.supabase.co:5432/postgres'

const USERS = [
  { email: 'admin@threein.sa',    password: 'Admin@123456',  username: 'admin',   name_ar: 'المدير العام',      role: 'accountant', brand_access: 'all' },
  { email: 'ops.ti@threein.sa',   password: 'Ops@123456',    username: 'ops_ti',  name_ar: 'مشغل Three In',    role: 'ops',        brand_access: 'ti'  },
  { email: 'ops.bb@threein.sa',   password: 'Ops@123456',    username: 'ops_bb',  name_ar: 'مشغل باب البلد',   role: 'ops',        brand_access: 'bb'  },
  { email: 'kitchen@threein.sa',  password: 'Kitchen@123',   username: 'kitchen', name_ar: 'المطبخ',            role: 'kitchen',    brand_access: 'all' },
]

async function listAllAuthUsers() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, {
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE}`, 'apikey': SERVICE_ROLE },
  })
  const data = await res.json()
  return data.users || []
}

async function createAuthUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'apikey': SERVICE_ROLE,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || JSON.stringify(data))
  return data.id
}

async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  // Clean up any wrong profiles from previous run
  await client.query(`delete from user_profiles where username in ('ops_ti','ops_bb','kitchen')`)

  const existingUsers = await listAllAuthUsers()
  const byEmail = Object.fromEntries(existingUsers.map(u => [u.email, u.id]))

  for (const user of USERS) {
    try {
      let userId = byEmail[user.email]
      if (userId) {
        console.log(`- ${user.email}: exists (${userId})`)
      } else {
        userId = await createAuthUser(user.email, user.password)
        console.log(`✓ Created: ${user.email} (${userId})`)
      }

      await client.query(`
        insert into user_profiles (id, username, name_ar, role, brand_access)
        values ($1, $2, $3, $4, $5)
        on conflict (id) do update
          set username = $2, name_ar = $3, role = $4, brand_access = $5
      `, [userId, user.username, user.name_ar, user.role, user.brand_access])
      console.log(`  ✓ Profile: ${user.username} [${user.role} / ${user.brand_access}]`)
    } catch (err) {
      console.error(`✗ ${user.email}:`, err.message)
    }
  }

  await client.end()
  console.log('\n✅ Done!\n')
  console.log('Login credentials:')
  USERS.forEach(u => console.log(`  ${u.email.padEnd(25)} ${u.password.padEnd(15)} [${u.role}]`))
}

run().catch(err => { console.error(err); process.exit(1) })
