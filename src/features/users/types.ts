export type User = {
  id: string
  firstName?: string
  lastName?: string
  username?: string | null
  email?: string
  role?: string
  isActive?: boolean
}

export default User
