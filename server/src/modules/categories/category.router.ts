import { Router } from "express";
import { asyncHandler } from "../../common/http";
import { readId } from "../../common/validation";
import { requireRoles } from "../auth/auth.middleware";
import {
  createCategoryAttribute,
  deleteCategoryAttribute,
  listCategoryAttributes,
  updateCategoryAttribute,
} from "../category-attributes/category-attribute.service";
import { parseCategoryAttributeInput } from "../category-attributes/category-attribute.validation";
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategories,
  updateCategory,
} from "./category.service";
import { parseCategoryInput } from "./category.validation";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_request, response) => {
    const categories = await listCategories();
    response.json(categories);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const category = await getCategoryById(readId(request.params.id, "id"));

    if (!category) {
      response.status(404).json({
        message: "Category not found.",
      });
      return;
    }

    response.json(category);
  }),
);

router.post(
  "/",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const category = await createCategory(parseCategoryInput(request.body));
    response.status(201).json(category);
  }),
);

router.get(
  "/:id/attributes",
  asyncHandler(async (request, response) => {
    const attributes = await listCategoryAttributes(readId(request.params.id, "id"));
    response.json(attributes);
  }),
);

router.post(
  "/:id/attributes",
  requireRoles("admin"),
  asyncHandler(async (request, response) => {
    const attribute = await createCategoryAttribute(
      readId(request.params.id, "id"),
      parseCategoryAttributeInput(request.body),
    );
    response.status(201).json(attribute);
  }),
);

router.put(
  "/:id/attributes/:attrId",
  requireRoles("admin"),
  asyncHandler(async (request, response) => {
    const attribute = await updateCategoryAttribute(
      readId(request.params.id, "id"),
      readId(request.params.attrId, "attrId"),
      parseCategoryAttributeInput(request.body),
    );
    response.json(attribute);
  }),
);

router.delete(
  "/:id/attributes/:attrId",
  requireRoles("admin"),
  asyncHandler(async (request, response) => {
    await deleteCategoryAttribute(
      readId(request.params.id, "id"),
      readId(request.params.attrId, "attrId"),
    );
    response.status(204).send();
  }),
);

router.put(
  "/:id",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const category = await updateCategory(
      readId(request.params.id, "id"),
      parseCategoryInput(request.body),
    );

    response.json(category);
  }),
);

router.delete(
  "/:id",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    await deleteCategory(readId(request.params.id, "id"));
    response.status(204).send();
  }),
);

export default router;
