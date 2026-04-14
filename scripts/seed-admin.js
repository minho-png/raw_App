/**
 * 최초 관리자 계정 시드 스크립트
 * 실행: node scripts/seed-admin.js
 * (MONGODB_URI 환경변수 필요)
 */
const { MongoClient } = require('mongodb')
const crypto = require('crypto')
require('dotenv').config({ path: '.env.local' })

const COST_FACTOR = 16384
const KEY_LENGTH  = 64

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LENGTH, { N: COST_FACTOR }).toString('hex')
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) { console.error('MONGODB_URI 없음'); process.exit(1) }

  const client = new MongoClient(uri)
  await client.connect()
  const col = client.db().collection('users')

  const existing = await col.countDocuments()
  if (existing > 0) {
    console.log(`이미 ${existing}명의 사용자가 있습니다. 스킵합니다.`)
    await client.close(); return
  }

  const username = 'Test1234'
  const password = 'Test1234'
  const salt = crypto.randomBytes(32).toString('hex')
  const passwordHash = hashPassword(password, salt)

  await col.insertOne({
    username,
    passwordHash,
    passwordSalt: salt,
    role: 'admin',
    createdAt: new Date().toISOString(),
  })

  await col.createIndex({ username: 1 }, { unique: true })
  console.log(`✅ 관리자 계정 생성 완료 — 아이디: ${username}`)
  await client.close()
}

main().catch(e => { console.error(e); process.exit(1) })
