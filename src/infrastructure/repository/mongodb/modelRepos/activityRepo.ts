import type { ActivityRepository } from '../../../../entities/interfaces/activityRepository'
import type { CreateUserActivity, UserActivity } from '../../../../entities/models/UserActivity'
import { DefaultRepository } from '../../index'
import { UserActivitySchema } from '../models/UserActivity'

export class ActivityRepo
  extends DefaultRepository<UserActivity, CreateUserActivity>
  implements ActivityRepository
{
  constructor() {
    super('UserActivity', UserActivitySchema)
  }
}
