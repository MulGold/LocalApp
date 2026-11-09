import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInventoryItem extends Document {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  stableQuantity: number;
  lowStockThreshold: number;
  lowStockAcknowledged?: boolean;
  lowStockAcknowledgedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema: Schema<IInventoryItem> = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    unit: { type: String, required: true, default: 'pcs', trim: true },
    stableQuantity: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 10, min: 0 },
    lowStockAcknowledged: { type: Boolean, default: false, index: true },
    lowStockAcknowledgedAt: { type: Date, default: null }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        delete ret.__v;
        return ret;
      }
    }
  }
);

export const InventoryItem: Model<IInventoryItem> = 
  mongoose.models.InventoryItem || mongoose.model<IInventoryItem>('InventoryItem', InventoryItemSchema);
