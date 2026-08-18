import mongoose, { type Model, type QueryFilter, type Schema, type UpdateQuery } from 'mongoose'
import type { Repository } from '../../entities/interfaces/database'

type MongoRecord = Record<string, unknown> & { _id?: unknown; __v?: unknown }

export class BaseMongoRepository<
  TEntity extends object,
  TCreate extends object = Partial<TEntity>,
  TUpdate extends object = Partial<TEntity>,
> implements Repository<TEntity, TCreate, TUpdate>
{
  protected readonly model: Model<TEntity>

  constructor(name: string, schema: Schema<TEntity>) {
    this.model =
      (mongoose.models[name] as Model<TEntity> | undefined) ?? mongoose.model<TEntity>(name, schema)
  }

  async create(input: TCreate): Promise<TEntity> {
    const document = await this.model.create(input)

    return this.toEntity(document.toObject() as MongoRecord)
  }

  async findById(id: string): Promise<TEntity | null> {
    const document = await this.model
      .findOne({ id } as QueryFilter<TEntity>)
      .lean()
      .exec()

    return document ? this.toEntity(document as MongoRecord) : null
  }

  async findOne(filter: Partial<TEntity>): Promise<TEntity | null> {
    const document = await this.model
      .findOne(filter as QueryFilter<TEntity>)
      .lean()
      .exec()

    return document ? this.toEntity(document as MongoRecord) : null
  }

  async findMany(filter: Partial<TEntity> = {}): Promise<TEntity[]> {
    const documents = await this.model
      .find(filter as QueryFilter<TEntity>)
      .lean()
      .exec()

    return documents.map((document) => this.toEntity(document as MongoRecord))
  }

  async updateById(id: string, input: TUpdate): Promise<TEntity | null> {
    const document = await this.model
      .findOneAndUpdate({ id } as QueryFilter<TEntity>, input as UpdateQuery<TEntity>, {
        new: true,
        runValidators: true,
      })
      .lean()
      .exec()

    return document ? this.toEntity(document as MongoRecord) : null
  }

  async deleteById(id: string): Promise<boolean> {
    return (await this.model.findOneAndDelete({ id } as QueryFilter<TEntity>).exec()) !== null
  }

  protected toEntity(record: MongoRecord): TEntity {
    const { _id: _mongoId, __v: _version, ...entity } = record

    return entity as TEntity
  }
}
