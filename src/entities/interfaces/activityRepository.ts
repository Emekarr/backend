import type { Repository } from './database'
import type { CreateUserActivity, UserActivity } from '../models/UserActivity'

export interface ActivityRepository extends Repository<UserActivity, CreateUserActivity> {}
