export type UserRole = 'admin' | 'operator'

export interface UserDoc {
  _id?: string
  username: string
  passwordHash: string
  passwordSalt: string
  role: UserRole
  createdAt: string
}

export interface SessionPayload {
  userId: string
  username: string
  role: UserRole
  issuedAt: number
}
