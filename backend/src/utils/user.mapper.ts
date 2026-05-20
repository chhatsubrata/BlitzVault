import { Users } from "../entities/Users";

export type PublicUser = Omit<Users, "password">;

export const toPublicUser = (user: Users): PublicUser => {
    const { password: _password, ...safeUser } = user;
    return safeUser;
};
