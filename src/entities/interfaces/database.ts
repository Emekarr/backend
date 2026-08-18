export interface Repository<TEntity, TCreate = Partial<TEntity>, TUpdate = Partial<TEntity>> {
  create(input: TCreate): Promise<TEntity>
  findById(id: string): Promise<TEntity | null>
  findOne(filter: Partial<TEntity>): Promise<TEntity | null>
  findMany(filter?: Partial<TEntity>): Promise<TEntity[]>
  updateById(id: string, input: TUpdate): Promise<TEntity | null>
  deleteById(id: string): Promise<boolean>
}

export interface CacheSetOptions {
  ttlSeconds?: number
  onlyIfAbsent?: boolean
}

export interface Cache {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<boolean>
  delete(key: string): Promise<boolean>
  exists(key: string): Promise<boolean>
}
