import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOrderItem {
  id: number | string;
  name: string;
  price: number;
  quantity: number;
  inventoryLinkId?: string | null;
  inventoryLinkIds?: string[];
  ingredients?: Array<{
    inventoryId: string;
    deductionQty: number;
  }>;
  unit?: string;
  image?: string;
  category?: string;
}

export interface IOrderCustomer {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  facebook?: string;
}

export interface IOrder extends Document {
  id: string; // e.g. 'ORD-1718...'
  customer: IOrderCustomer;
  userEmail?: string;
  userName?: string;
  items: IOrderItem[];
  subtotal?: number;
  total: number;
  amountPaid?: number;
  change?: number;
  paymentMethod: string;
  paymentStatus: 'Unpaid' | 'Paid' | 'Refunded' | 'Cancelled';
  status: 'Pending' | 'Paid' | 'Processing' | 'Cooking' | 'Ready for Pickup' | 'Ready to Pickup' | 'On Delivery' | 'Completed' | 'Cancelled';
  cancelledBy?: 'customer' | 'admin' | 'staff' | null;
  inventoryDeducted?: boolean;
  inventoryRestored?: boolean;
  inventoryRestoredAt?: Date | null;
  pickupNotificationSent?: boolean;
  pickupNotificationSentAt?: Date | null;
  orderType: 'POS' | 'Online';
  paymentScreenshot?: string;
  adminViewed?: boolean;
  adminViewedAt?: Date | null;
  customerViewedStatus?: string;
  customerLastViewedAt?: Date | null;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    id: { type: Schema.Types.Mixed, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    inventoryLinkId: { type: String, default: null },
    inventoryLinkIds: { type: [String], default: [] },
    ingredients: {
      type: [
        {
          _id: false,
          inventoryId: { type: String, required: true },
          deductionQty: { type: Number, required: true }
        }
      ],
      default: []
    },
    unit: { type: String, default: 'pcs' },
    image: { type: String, default: '' },
    category: { type: String, default: '' }
  },
  { _id: false }
);

const OrderCustomerSchema = new Schema<IOrderCustomer>(
  {
    name: { type: String, required: true, default: 'Walk-in Customer' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    facebook: { type: String, default: '' }
  },
  { _id: false }
);

const OrderSchema: Schema<IOrder> = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    customer: { type: OrderCustomerSchema, required: true },
    userEmail: { type: String, default: '', index: true },
    userName: { type: String, default: '' },
    items: { type: [OrderItemSchema], required: true },
    subtotal: { type: Number, default: 0 },
    total: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    change: { type: Number, default: 0 },
    paymentMethod: { 
      type: String, 
      default: 'Cash',
      index: true
    },
    paymentStatus: { 
      type: String, 
      enum: ['Unpaid', 'Paid', 'Refunded', 'Cancelled'], 
      default: 'Unpaid',
      index: true
    },
    status: { 
      type: String, 
      enum: ['Pending', 'Paid', 'Processing', 'Cooking', 'Ready for Pickup', 'Ready to Pickup', 'On Delivery', 'Completed', 'Cancelled'], 
      default: 'Pending',
      index: true
    },
    cancelledBy: {
      type: String,
      enum: ['customer', 'admin', 'staff', null],
      default: null,
      index: true
    },
    inventoryDeducted: { type: Boolean, default: true, index: true },
    inventoryRestored: { type: Boolean, default: false, index: true },
    inventoryRestoredAt: { type: Date, default: null },
    pickupNotificationSent: { type: Boolean, default: false, index: true },
    pickupNotificationSentAt: { type: Date, default: null },
    orderType: { 
      type: String, 
      enum: ['POS', 'Online'], 
      default: 'Online',
      index: true
    },
    paymentScreenshot: { type: String, default: '' },
    adminViewed: { type: Boolean, default: false, index: true },
    adminViewedAt: { type: Date, default: null },
    customerViewedStatus: { type: String, default: '' },
    customerLastViewedAt: { type: Date, default: null },
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

// Compound indexes justified by actual production query patterns
OrderSchema.index({ userEmail: 1, createdAt: -1 });
OrderSchema.index({ 'customer.email': 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ createdAt: -1 });

export const Order: Model<IOrder> = 
  mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
