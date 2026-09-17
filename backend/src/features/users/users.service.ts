import { Not } from "typeorm";
import AppDataSource from "../../config/db";
import { Users } from "../../entities/Users";

type CreateUserInput = {
    clerk_user_id: string;
    email: string;
    username: string;
    avatar_url?: string | null;
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

/**
 * `%` and `_` are LIKE wildcards: typed literally they would turn a search for
 * "a_b" into a pattern match. Escape them (and the escape character itself) so
 * the term is compared as text.
 */
const escapeLikeTerm = (term: string): string =>
    term.replace(/[\\%_]/g, (match) => `\\${match}`);

export const createUserService = async (input: CreateUserInput) => {
    const { clerk_user_id, email, username, avatar_url } = input;

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
        avatar_url: avatar_url ?? null,
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

/** Local user id for a Clerk subject, or null when the account is unsynced. */
export const findUserIdByClerkIdService = async (
    clerkUserId: string
): Promise<string | null> => {
    const user = await userRepository.findOne({
        where: { clerk_user_id: clerkUserId },
        select: { id: true },
    });
    return user?.id ?? null;
};

export type UserSearchResult = {
    id: string;
    email: string;
    username: string;
    avatar_url: string | null;
};

type SearchUsersInput = {
    q: string;
    limit: number;
    /** The caller — never offer someone themselves as a share target. */
    excludeUserId?: string;
};

/**
 * Typeahead lookup for the share dialog's member picker.
 *
 * Selects only what the picker renders — `clerk_user_id` is an auth identifier
 * and has no business reaching another user's browser, which the paginated list
 * endpoint gets wrong today.
 */
export const searchUsersService = async ({
    q,
    limit,
    excludeUserId,
}: SearchUsersInput): Promise<UserSearchResult[]> => {
    const query = userRepository
        .createQueryBuilder("user")
        .select(["user.id", "user.email", "user.username", "user.avatar_url"])
        // ILIKE both columns: people search by the handle they remember, which
        // is as often a username as an email.
        .where("(user.email ILIKE :term OR user.username ILIKE :term)", {
            term: `%${escapeLikeTerm(q)}%`,
        })
        .orderBy("user.email", "ASC")
        .take(limit);

    if (excludeUserId) {
        query.andWhere("user.id != :excludeUserId", { excludeUserId });
    }

    return query.getMany();
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
    const { clerk_user_id, email, username, avatar_url } = input;
    const existingByClerkId = await userRepository.findOne({ where: { clerk_user_id } });

    if (existingByClerkId) {
        existingByClerkId.email = email;
        existingByClerkId.username = username;
        // Undefined means "caller did not resolve it" — keep what we have.
        if (avatar_url !== undefined) existingByClerkId.avatar_url = avatar_url;
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
        if (avatar_url !== undefined) existingByIdentity.avatar_url = avatar_url;
        const linkedUser = await userRepository.save(existingByIdentity);
        return { user: linkedUser };
    }

    const newUser = userRepository.create({
        clerk_user_id,
        email,
        username,
        avatar_url: avatar_url ?? null,
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