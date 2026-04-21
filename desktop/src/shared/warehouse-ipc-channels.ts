export const WAREHOUSE_IPC_CHANNELS = {
  createProduct: "warehouse:createProduct",
  createStockMovement: "warehouse:createStockMovement",
  createWarehouse: "warehouse:createWarehouse",
  getProducts: "warehouse:getProducts",
  getStockMovements: "warehouse:getStockMovements",
  getWarehouses: "warehouse:getWarehouses",
  getWarehouseStock: "warehouse:getWarehouseStock",
  setWarehouseStock: "warehouse:setWarehouseStock",
  updateProductStock: "warehouse:updateProductStock",
} as const;
