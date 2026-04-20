export const WAREHOUSE_IPC_CHANNELS = {
  createProduct: "warehouse:createProduct",
  createStockMovement: "warehouse:createStockMovement",
  getProducts: "warehouse:getProducts",
  getStockMovements: "warehouse:getStockMovements",
  updateProductStock: "warehouse:updateProductStock",
} as const;
