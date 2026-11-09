import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInventoryLog extends Document {
  id: string;
  inventoryId: string;
  itemName: string;
  type: 'stock-in' | 'stock-out' | 'order-deduction' | 'manual-adjustment' | 'order-cancellation-restock';
  quantityChange: number;
  remainingQuantity: number;
  reason?: string;
  orderId?: string;
  performedBy?: string;
  date: Date;
}

const InventoryLogSchema: Schema<IInventoryLog> = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    inventoryId: { type: String, required: true, index: true },
    itemName: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['stock-in', 'stock-out', 'order-deduction', 'manual-adjustment', 'order-cancellation-restock'], 
      required: true,
      index: true
    },
    quantityChange: { type: Number, required: true },
    remainingQuantity: { type: Number, required: true },
    reason: { type: String, default: '' },
    orderId: { type: String, default: null, index: true },
    performedBy: { type: String, default: 'System' },
    date: { type: Date, default: Date.now, index: true }
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

export const InventoryLog: Model<IInventoryLog> = 
  mongoose.models.InventoryLog || mongoose.model<IInventoryLog>('InventoryLog', InventoryLogSchema);
