import { Not } from "typeorm";
import AppDataSource from "../../config/db";
import { Users } from "../../entities/Users";

type CreateUserInput = {
    clerk_user_id: string;
    email: string;
    username: string;
};
type UpdateUserInput = {
    email?: string;
    username?: string;
};
type ListUsersInput = {
    page: number;
    limit: number;
};

const userRepository = AppDataSource.getRepository(Users);

export const createUserService = async (input: CreateUserInput) => {
    const { clerk_user_id, email, username } = input;

    const existingUser = await userRepository.findOne({
        where: [{ clerk_user_id }, { email }, { username }],
    });

    if (existingUser) {
        return { user: null, alreadyExists: true };
    }

    const newUser = userRepository.create({
        clerk_user_id,
        email,
        username,
    });

    const savedUser = await userRepository.save(newUser);

    return { user: savedUser, alreadyExists: false };
};

export const getAllUsersService = async (input: ListUsersInput) => {
    const { page, limit } = input;
    const skip = (page - 1) * limit;

    const [users, total] = await userRepository.findAndCount({
        order: { created_at: "DESC" },
        skip,
        take: limit,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
        users,
        pagination: {
            total,
            page,
            limit,
            totalPages,
        },
    };
};

export const getUsersByIdService = async (id: string) => {
    const user = await userRepository.findOne({ where: { id } });
    return { user };
}

export const updateUserService = async (id: string, input: UpdateUserInput) => {
    const { email, username } = input;

    const user = await userRepository.findOne({ where: { id } });
    if (!user) {
        return {
            user: null,
            notFound: true,
            emailAlreadyExists: false,
            usernameAlreadyExists: false,
        };
    }

    if (email) {
        const existingUser = await userRepository.findOne({
            where: { email, id: Not(id) },
        });
        if (existingUser) {
            return {
                user: null,
                notFound: false,
                emailAlreadyExists: true,
                usernameAlreadyExists: false,
            };
        }
        user.email = email;
    }
    if (username) {
        const existingUser = await userRepository.findOne({
            where: { username, id: Not(id) },
        });
        if (existingUser) {
            return {
                user: null,
                notFound: false,
                emailAlreadyExists: false,
                usernameAlreadyExists: true,
            };
        }
        user.username = username;
    }
    const updatedUser = await userRepository.save(user);
    return { user: updatedUser, notFound: false, emailAlreadyExists: false, usernameAlreadyExists: false };
}

export const upsertUserFromClerkService = async (input: CreateUserInput) => {
    const { clerk_user_id, email, username } = input;
    const existingByClerkId = await userRepository.findOne({ where: { clerk_user_id } });

    if (existingByClerkId) {
        existingByClerkId.email = email;
        existingByClerkId.username = username;
        const updatedUser = await userRepository.save(existingByClerkId);
        return { user: updatedUser };
    }

    const existingByIdentity = await userRepository.findOne({
        where: [{ email }, { username }],
    });

    if (existingByIdentity) {
        existingByIdentity.clerk_user_id = clerk_user_id;
        existingByIdentity.email = email;
        existingByIdentity.username = username;
        const linkedUser = await userRepository.save(existingByIdentity);
        return { user: linkedUser };
    }

    const newUser = userRepository.create({
        clerk_user_id,
        email,
        username,
    });

    const savedUser = await userRepository.save(newUser);
    return { user: savedUser };
};

export const deleteUserService = async (id: string) => {
    const user = await userRepository.findOne({ where: { id } });
    if (!user) {
        return { user: null, notFound: true };
    }
    await userRepository.delete(id);
    return { user: null, notFound: false };
}