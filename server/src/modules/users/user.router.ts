import { Router } from "express";
import { AppError, notFoundError } from "../../common/errors";
import { asyncHandler } from "../../common/http";
import { readId } from "../../common/validation";
import {
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  resetUserPassword,
  updateUser,
  updateUserRole,
} from "./user.service";
import { parseCreateUserInput, parseUpdateUserInput, parseUpdateUserRoleInput } from "./user.validation";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_request, response) => {
    const users = await listUsers();
    response.json(users);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const user = await getUserById(readId(request.params.id, "id"));

    if (!user) {
      throw notFoundError("User");
    }

    response.json(user);
  }),
);

router.post(
  "/",
  asyncHandler(async (request, response) => {
    const user = await createUser(parseCreateUserInput(request.body), request.authenticatedUser?.id);
    response.status(201).json(user);
  }),
);

router.put(
  "/:id",
  asyncHandler(async (request, response) => {
    const userId = readId(request.params.id, "id");
    const currentUser = request.authenticatedUser;
    const input = parseUpdateUserInput(request.body);

    if (currentUser && currentUser.id === userId && input.status === "inactive") {
      throw new AppError(400, "You cannot deactivate your own account.");
    }

    const user = await updateUser(userId, input, currentUser?.id);
    response.json(user);
  }),
);

router.patch(
  "/:id/role",
  asyncHandler(async (request, response) => {
    const user = await updateUserRole(
      readId(request.params.id, "id"),
      parseUpdateUserRoleInput(request.body),
      request.authenticatedUser?.id,
    );

    response.json(user);
  }),
);

router.put(
  "/:id/reset-password",
  asyncHandler(async (request, response) => {
    const actorUserId = request.authenticatedUser?.id;

    if (!actorUserId) {
      throw new AppError(401, "Authentication required.");
    }

    const result = await resetUserPassword(readId(request.params.id, "id"), actorUserId);
    response.json(result);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const userId = readId(request.params.id, "id");
    const currentUser = request.authenticatedUser;

    if (currentUser && currentUser.id === userId) {
      throw new AppError(400, "You cannot delete your own account.");
    }

    await deleteUser(userId, currentUser?.id);
    response.status(204).send();
  }),
);

export default router;
