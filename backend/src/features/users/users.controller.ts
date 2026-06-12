import { Request, Response } from "express";
import { createUserService, deleteUserService, getAllUsersService, getUsersByIdService, updateUserService } from "./users.service";
import {
    badRequestResponse,
    createdResponse,
    internalServerErrorResponse,
    notFoundResponse,
    successResponse,
} from "../../utils/responses";
import { toPublicUser } from "../../utils/user.mapper";
import { listUsersQuerySchema } from "./users.schema";

export const createUser = async (req: Request, res: Response) => {
    try {
        const { clerk_user_id, email, username } = req.body;

        const { user, alreadyExists } = await createUserService({
            clerk_user_id,
            email,
            username,
        });

        if (alreadyExists) {
            return badRequestResponse(
                res,
                "User already exists. Please use a different clerk_user_id, email or username."
            );
        }

        if (!user) {
            return badRequestResponse(res, "Unable to create user");
        }

        return createdResponse(res, "User created successfully", toPublicUser(user));
    } catch (error) {
        console.error("Error creating user: ", error);
        return internalServerErrorResponse(res);
    }
};

export const getUser = async (req: Request, res: Response) => {
    try {
        const validatedQuery = res.locals.validatedRequest?.query ?? req.query;
        const { page, limit } = listUsersQuerySchema.parse(validatedQuery);
        const { users, pagination } = await getAllUsersService({ page, limit });
        const safeUsers = users.map(toPublicUser);

        return successResponse(res, "Users fetched successfully", {
            items: safeUsers,
            pagination,
        });
    } catch (error) {
        console.error("Error fetching users: ", error);
        return internalServerErrorResponse(res);
    }
};

export const getUserById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { user } = await getUsersByIdService(id as string);
        if (!user) {
            return notFoundResponse(res, "User not found");
        }
        return successResponse(res, "User fetched successfully", toPublicUser(user));
    } catch (error) {
        console.error("Error fetching user: ", error);
        return internalServerErrorResponse(res);
    }
};

export const updateUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { email, username } = req.body;
        const { user, notFound, emailAlreadyExists, usernameAlreadyExists } = await updateUserService(id as string, { email, username });
        if (notFound) {
            return notFoundResponse(res, "User not found");
        }
        if (emailAlreadyExists) {
            return badRequestResponse(res, "Email already exists");
        }
        if (usernameAlreadyExists) {
            return badRequestResponse(res, "Username already exists");
        }
        if (!user) {
            return badRequestResponse(res, "Unable to update user");
        }

        return successResponse(res, "User updated successfully", toPublicUser(user));
    } catch (error) {
        console.error("Error updating user: ", error);
        return internalServerErrorResponse(res);
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { user, notFound } = await deleteUserService(id as string);
        if (notFound) {
            return notFoundResponse(res, "User not found");
        }
        return successResponse(res, "User deleted successfully", user ? toPublicUser(user) : null);
    } catch (error) {
        console.error("Error deleting user: ", error);
        return internalServerErrorResponse(res);
    }
};