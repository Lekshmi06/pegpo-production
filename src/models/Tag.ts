import mongoose, { Document, Schema } from "mongoose";

export interface ITag extends Document {
  id?: number;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const TagSchema = new Schema<ITag>(
  {
    id: { type: Number, index: true },
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        ret.id = ret.id || ret._id;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

export const Tag =
  mongoose.models.Tag || mongoose.model<ITag>("Tag", TagSchema);
export default Tag;
