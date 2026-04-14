export interface DispatchItem {
  id: number;
  dispatchId: number;
  productId: number;
  productName: string;
  productSku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Dispatch {
  id: number;
  manualDestination: string;
  carrierName: string;
  createdAt: string;
  notes: string | null;
  totalAmount: number;
  items: DispatchItem[];
}

export interface CreateDispatchItemInput {
  productId: number;
  quantity: number;
  unitPrice: number;
}

export interface CreateDispatchInput {
  manualDestination: string;
  carrierName: string;
  notes?: string | null;
  items: CreateDispatchItemInput[];
}
