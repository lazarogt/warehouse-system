import type { DatabaseClient } from "../lib/db";
import { query, withTransaction } from "../lib/db";
import { env } from "../config/env";
import { ensureDefaultAdminUser } from "../modules/users/user.service";

type SeedCategoryAttribute = {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "date" | "select";
  required: boolean;
  options?: string[];
  sortOrder: number;
};

type SeedProduct = {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  categoryName: string;
  price: number;
  minimumStock: number;
  stock: number;
  attributes: Record<string, string>;
};

const SEED_WAREHOUSE_NAME = "Almacen Central";

const seedCategories: Array<{
  name: string;
  description: string;
  attributes: SeedCategoryAttribute[];
}> = [
  {
    name: "Electrónicos",
    description: "Equipos y accesorios electronicos",
    attributes: [
      { key: "marca", label: "Marca", type: "text", required: true, sortOrder: 1 },
      { key: "modelo", label: "Modelo", type: "text", required: false, sortOrder: 2 },
      { key: "garantia_meses", label: "Garantia (meses)", type: "number", required: false, sortOrder: 3 },
      { key: "voltaje", label: "Voltaje", type: "select", required: false, options: ["110V", "220V"], sortOrder: 4 },
    ],
  },
  {
    name: "Alimentos",
    description: "Productos alimenticios y perecederos",
    attributes: [
      { key: "fecha_vencimiento", label: "Fecha de vencimiento", type: "date", required: true, sortOrder: 1 },
      { key: "peso", label: "Peso", type: "number", required: false, sortOrder: 2 },
      { key: "perecedero", label: "Perecedero", type: "boolean", required: false, sortOrder: 3 },
    ],
  },
  {
    name: "Ropa",
    description: "Prendas y accesorios textiles",
    attributes: [
      { key: "talla", label: "Talla", type: "select", required: false, options: ["S", "M", "L", "XL"], sortOrder: 1 },
      { key: "color", label: "Color", type: "text", required: false, sortOrder: 2 },
      { key: "material", label: "Material", type: "text", required: false, sortOrder: 3 },
    ],
  },
  {
    name: "Ferretería",
    description: "Herramientas e insumos de ferreteria",
    attributes: [
      { key: "material", label: "Material", type: "text", required: false, sortOrder: 1 },
      { key: "peso", label: "Peso", type: "number", required: false, sortOrder: 2 },
      { key: "uso", label: "Uso", type: "text", required: false, sortOrder: 3 },
    ],
  },
];

const seedProducts: SeedProduct[] = [
  {
    name: "Taladro Inalambrico 18V",
    sku: "ELEC-DRILL-18V-001",
    barcode: "770100000001",
    description: "Taladro compacto para uso profesional.",
    categoryName: "Electrónicos",
    price: 149.99,
    minimumStock: 4,
    stock: 16,
    attributes: { marca: "Bosch", modelo: "GSR18", garantia_meses: "24", voltaje: "220V" },
  },
  {
    name: "Multimetro Digital",
    sku: "ELEC-METER-117-001",
    barcode: "770100000002",
    description: "Instrumento de medicion electrica de alta precision.",
    categoryName: "Electrónicos",
    price: 79.5,
    minimumStock: 5,
    stock: 22,
    attributes: { marca: "Fluke", modelo: "117", garantia_meses: "12", voltaje: "110V" },
  },
  {
    name: "Arroz Premium 5kg",
    sku: "FOOD-RICE-5KG-001",
    barcode: "770100000003",
    description: "Paquete de arroz premium para consumo diario.",
    categoryName: "Alimentos",
    price: 12.75,
    minimumStock: 12,
    stock: 40,
    attributes: { fecha_vencimiento: "2026-12-15", peso: "5", perecedero: "false" },
  },
  {
    name: "Yogur Natural Pack",
    sku: "FOOD-YOGUR-PACK-001",
    barcode: "770100000004",
    description: "Pack refrigerado de yogur natural.",
    categoryName: "Alimentos",
    price: 6.4,
    minimumStock: 10,
    stock: 18,
    attributes: { fecha_vencimiento: "2026-04-20", peso: "1.2", perecedero: "true" },
  },
  {
    name: "Camiseta Basica",
    sku: "CLOT-TSHIRT-BASIC-001",
    barcode: "770100000005",
    description: "Camiseta de uso diario de algodon.",
    categoryName: "Ropa",
    price: 14.9,
    minimumStock: 8,
    stock: 30,
    attributes: { talla: "M", color: "Negro", material: "Algodon" },
  },
  {
    name: "Chaqueta Impermeable",
    sku: "CLOT-JACKET-RAIN-001",
    barcode: "770100000006",
    description: "Prenda exterior ligera y resistente al agua.",
    categoryName: "Ropa",
    price: 54.9,
    minimumStock: 6,
    stock: 14,
    attributes: { talla: "L", color: "Azul marino", material: "Poliester" },
  },
  {
    name: "Martillo de Garra",
    sku: "HARD-HAMMER-CLAW-001",
    barcode: "770100000007",
    description: "Herramienta manual para carpinteria y ensamble.",
    categoryName: "Ferretería",
    price: 18.25,
    minimumStock: 6,
    stock: 25,
    attributes: { material: "Acero", peso: "0.75", uso: "Carpinteria" },
  },
  {
    name: "Caja de Tornillos",
    sku: "HARD-SCREWS-BOX-001",
    barcode: "770100000008",
    description: "Tornillos galvanizados de uso general.",
    categoryName: "Ferretería",
    price: 9.3,
    minimumStock: 15,
    stock: 60,
    attributes: { material: "Acero galvanizado", peso: "1", uso: "Fijacion" },
  },
];

const getDatabaseCounts = async () => {
  const result = await query<{
    users: number;
    categories: number;
    products: number;
    warehouses: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM categories) AS categories,
      (SELECT COUNT(*)::int FROM products) AS products,
      (SELECT COUNT(*)::int FROM warehouses) AS warehouses;
  `);

  return result.rows[0];
};

const getAdminUserId = async (client?: DatabaseClient) => {
  const sql = "SELECT id FROM users WHERE username = $1 OR email = $2 ORDER BY id LIMIT 1;";
  const result = client
    ? await client.query<{ id: number }>(sql, [env.defaultAdmin.username, env.defaultAdmin.email])
    : await query<{ id: number }>(sql, [env.defaultAdmin.username, env.defaultAdmin.email]);

  if (!result.rows[0]) {
    throw new Error("Default admin user not found while seeding.");
  }

  return result.rows[0].id;
};

const ensureWarehouse = async (client: DatabaseClient) => {
  const existingWarehouse = await client.query<{ id: number }>(
    "SELECT id FROM warehouses WHERE name = $1 LIMIT 1;",
    [SEED_WAREHOUSE_NAME],
  );

  if (existingWarehouse.rows[0]) {
    return {
      id: existingWarehouse.rows[0].id,
      created: false,
    };
  }

  const createdWarehouse = await client.query<{ id: number }>(
    `
      INSERT INTO warehouses (name, description)
      VALUES ($1, $2)
      RETURNING id;
    `,
    [SEED_WAREHOUSE_NAME, "Almacen inicial para pruebas locales"],
  );

  return {
    id: createdWarehouse.rows[0].id,
    created: true,
  };
};

const ensureCategory = async (
  client: DatabaseClient,
  category: (typeof seedCategories)[number],
) => {
  const existingCategory = await client.query<{ id: number }>(
    "SELECT id FROM categories WHERE name = $1 LIMIT 1;",
    [category.name],
  );

  if (existingCategory.rows[0]) {
    await client.query(
      `
        UPDATE categories
        SET
          description = $2,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [existingCategory.rows[0].id, category.description],
    );

    return {
      id: existingCategory.rows[0].id,
      created: false,
    };
  }

  const createdCategory = await client.query<{ id: number }>(
    `
      INSERT INTO categories (name, description)
      VALUES ($1, $2)
      RETURNING id;
    `,
    [category.name, category.description],
  );

  return {
    id: createdCategory.rows[0].id,
    created: true,
  };
};

const ensureCategoryAttribute = async (
  client: DatabaseClient,
  categoryId: number,
  attribute: SeedCategoryAttribute,
) => {
  const existingAttribute = await client.query<{ id: number }>(
    `
      SELECT id
      FROM category_attributes
      WHERE category_id = $1
        AND key = $2
      LIMIT 1;
    `,
    [categoryId, attribute.key],
  );

  if (existingAttribute.rows[0]) {
    await client.query(
      `
        UPDATE category_attributes
        SET
          label = $3,
          type = $4,
          required = $5,
          options = $6::jsonb,
          sort_order = $7,
          active = TRUE,
          updated_at = NOW()
        WHERE id = $1
          AND category_id = $2;
      `,
      [
        existingAttribute.rows[0].id,
        categoryId,
        attribute.label,
        attribute.type,
        attribute.required,
        attribute.options ? JSON.stringify(attribute.options) : null,
        attribute.sortOrder,
      ],
    );

    return {
      id: existingAttribute.rows[0].id,
      created: false,
    };
  }

  const createdAttribute = await client.query<{ id: number }>(
    `
      INSERT INTO category_attributes (
        category_id,
        key,
        label,
        type,
        required,
        options,
        sort_order,
        active
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, TRUE)
      RETURNING id;
    `,
    [
      categoryId,
      attribute.key,
      attribute.label,
      attribute.type,
      attribute.required,
      attribute.options ? JSON.stringify(attribute.options) : null,
      attribute.sortOrder,
    ],
  );

  return {
    id: createdAttribute.rows[0].id,
    created: true,
  };
};

const ensureProduct = async (
  client: DatabaseClient,
  product: SeedProduct,
  categoryId: number,
) => {
  const existingProduct = await client.query<{ id: number }>(
    `
      SELECT id
      FROM products
      WHERE name = $1
        AND category_id = $2
      LIMIT 1;
    `,
    [product.name, categoryId],
  );

  if (existingProduct.rows[0]) {
    await client.query(
      `
        UPDATE products
        SET
          sku = COALESCE(sku, $2),
          barcode = COALESCE(barcode, $3),
          description = $4,
          price = $5,
          minimum_stock = $6,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [
        existingProduct.rows[0].id,
        product.sku,
        product.barcode,
        product.description,
        product.price,
        product.minimumStock,
      ],
    );

    return {
      id: existingProduct.rows[0].id,
      created: false,
    };
  }

  const createdProduct = await client.query<{ id: number }>(
    `
      INSERT INTO products (name, sku, barcode, description, category_id, price, minimum_stock)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id;
    `,
    [
      product.name,
      product.sku,
      product.barcode,
      product.description,
      categoryId,
      product.price,
      product.minimumStock,
    ],
  );

  return {
    id: createdProduct.rows[0].id,
    created: true,
  };
};

export const runSeed = async () => {
  await ensureDefaultAdminUser();

  const adminUserId = await getAdminUserId();

  return withTransaction(async (client) => {
    const warehouse = await ensureWarehouse(client);
    const categoryIds = new Map<string, number>();
    const categoryAttributeIds = new Map<string, number>();
    let createdCategories = 0;
    let createdProducts = 0;

    for (const category of seedCategories) {
      const ensuredCategory = await ensureCategory(client, category);
      categoryIds.set(category.name, ensuredCategory.id);
      createdCategories += ensuredCategory.created ? 1 : 0;

      for (const attribute of category.attributes) {
        const ensuredAttribute = await ensureCategoryAttribute(client, ensuredCategory.id, attribute);
        categoryAttributeIds.set(`${category.name}:${attribute.key}`, ensuredAttribute.id);
      }
    }

    for (const product of seedProducts) {
      const categoryId = categoryIds.get(product.categoryName);

      if (!categoryId) {
        throw new Error(`Seed category not found for product ${product.name}.`);
      }

      const ensuredProduct = await ensureProduct(client, product, categoryId);

      if (!ensuredProduct.created) {
        continue;
      }

      createdProducts += 1;

      await client.query(
        `
          INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
          VALUES ($1, $2, $3)
          ON CONFLICT (warehouse_id, product_id) DO NOTHING;
        `,
        [warehouse.id, ensuredProduct.id, product.stock],
      );

      await client.query(
        `
          INSERT INTO stock_movements (
            product_id,
            warehouse_id,
            user_id,
            type,
            quantity,
            movement_date,
            observation
          )
          VALUES ($1, $2, $3, 'entry', $4, NOW(), 'Carga inicial de seed');
        `,
        [ensuredProduct.id, warehouse.id, adminUserId, product.stock],
      );

      for (const [attributeKey, attributeValue] of Object.entries(product.attributes)) {
        const categoryAttributeId = categoryAttributeIds.get(`${product.categoryName}:${attributeKey}`);

        if (!categoryAttributeId) {
          throw new Error(`Seed attribute ${attributeKey} not found for ${product.name}.`);
        }

        await client.query(
          `
            INSERT INTO product_attributes (product_id, category_attribute_id, value)
            VALUES ($1, $2, $3)
            ON CONFLICT (product_id, category_attribute_id)
            DO NOTHING;
          `,
          [ensuredProduct.id, categoryAttributeId, attributeValue],
        );
      }
    }

    return {
      seeded: true,
      categories: createdCategories,
      products: createdProducts,
      warehouseCreated: warehouse.created,
    };
  });
};

export const seedDatabaseIfEmpty = async () => {
  await ensureDefaultAdminUser();
  const counts = await getDatabaseCounts();

  if (counts.categories === 0 && counts.products === 0 && counts.warehouses === 0) {
    return runSeed();
  }

  return {
    seeded: false,
    reason: "Database already initialized.",
  };
};
