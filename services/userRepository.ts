import type { MongoClient } from 'mongodb'
import type { UserDoc, UserRole } from '@/types/auth'
import { hashPassword, generateSalt, verifyPassword } from '@/lib/auth/crypto'

const COLLECTION = 'users'

export class UserRepository {
  private col

  constructor(client: MongoClient) {
    this.col = client.db().collection<UserDoc>(COLLECTION)
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ username: 1 }, { unique: true })
  }

  async findByUsername(username: string): Promise<UserDoc | null> {
    return this.col.findOne({ username })
  }

  async createUser(username: string, password: string, role: UserRole = 'operator'): Promise<void> {
    const salt = generateSalt()
    const passwordHash = hashPassword(password, salt)
    await this.col.insertOne({
      username,
      passwordHash,
      passwordSalt: salt,
      role,
      createdAt: new Date().toISOString(),
    })
  }

  /**
   * 사용자 upsert — 없으면 생성, 있으면 비밀번호/역할 재설정.
   * 기본 관리자 계정 초기화(reset)용. 다른 사용자는 건드리지 않음.
   */
  async upsertUser(username: string, password: string, role: UserRole = 'operator'): Promise<void> {
    const salt = generateSalt()
    const passwordHash = hashPassword(password, salt)
    await this.col.updateOne(
      { username },
      {
        $set: { passwordHash, passwordSalt: salt, role },
        $setOnInsert: { createdAt: new Date().toISOString() },
      },
      { upsert: true },
    )
  }

  async verifyCredentials(username: string, password: string): Promise<UserDoc | null> {
    const user = await this.findByUsername(username)
    if (!user) return null
    const ok = verifyPassword(password, user.passwordSalt, user.passwordHash)
    return ok ? user : null
  }

  async countUsers(): Promise<number> {
    return this.col.countDocuments()
  }
}
