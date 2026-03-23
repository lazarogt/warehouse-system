import { Router } from "express";
import { asyncHandler } from "../../common/http";
import { notFoundError } from "../../common/errors";
import { readId } from "../../common/validation";
import { requireRoles } from "../auth/auth.middleware";
import { recordCriticalEvent } from "../logging/logging.service";
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  lookupProduct,
  updateProduct,
} from "./product.service";
import { parseProductFilters, parseProductInput, parseProductLookup } from "./product.validation";

const router = Router();

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const products = await listProducts(parseProductFilters(request.query));
    response.json(products);
  }),
);

router.get(
  "/lookup",
  asyncHandler(async (request, response) => {
    const product = await lookupProduct(parseProductLookup(request.query));
    response.json(product);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const product = await getProductById(readId(request.params.id, "id"));

    if (!product) {
      throw notFoundError("Product");
    }

    response.json(product);
  }),
);

router.post(
  "/",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const product = await createProduct(parseProductInput(request.body));
    recordCriticalEvent({
      eventType: "product.created",
      actorUserId: request.authenticatedUser?.id,
      targetEntityId: product.id,
      targetEntityType: "product",
      metadata: {
        name: product.name,
        categoryId: product.categoryId,
      },
    });
    response.status(201).json(product);
  }),
);

router.put(
  "/:id",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const product = await updateProduct(readId(request.params.id, "id"), parseProductInput(request.body));
    response.json(product);
  }),
);

router.delete(
  "/:id",
  requireRoles("admin"),
  asyncHandler(async (request, response) => {
    const productId = readId(request.params.id, "id");
    await deleteProduct(productId);
    recordCriticalEvent({
      eventType: "product.deleted",
      actorUserId: request.authenticatedUser?.id,
      targetEntityId: productId,
      targetEntityType: "product",
    });
    response.status(204).send();
  }),
);

export default router;
