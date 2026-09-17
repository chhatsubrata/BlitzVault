import crypto from "crypto";
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Model lock (Week 3 Tue). `backend/src/authz/model.fga` is a contract: the
 * `authorize()` middleware, the outbox tuple writers and the FE share UI all
 * hardcode its relation names. This test is the mechanical half of that freeze
 * — the review discipline half lives in docs/openfga-model.md.
 *
 * To change the model: write an ADR under docs/adr/, then update MODEL_SHA256
 * (`pnpm fga:init --write-env` to push it, and remember every write mints a new
 * FGA_MODEL_ID).
 */

const MODEL_PATH = path.resolve(__dirname, "../../src/authz/model.fga");

// sha256 of the normalized DSL, frozen at the Tue model-lock review.
const MODEL_SHA256 = "b611cd2af5a7e36a70baab9ba4db4d26754b3a435f843b0de62e8f221f559a0b";

const FREEZE_MESSAGE =
    "model.fga changed after the Week 3 model lock — write an ADR under docs/adr/, then update MODEL_SHA256 in this test.";

/**
 * Comment lines and blank lines are free to change; relations are not. Only a
 * whole-line `#` comment is stripped — mid-line `#` is a userset separator
 * (`team#member`, `public_link#accessor`), not a comment.
 */
const normalize = (dsl: string): string =>
    dsl
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0 && !/^\s*#/.test(line))
        .join("\n");

const dsl = fs.readFileSync(MODEL_PATH, "utf8");

/** The relation block of one `type X` stanza. */
const relationsOf = (type: string): string => {
    // Split on the stanza keyword rather than regex-matching across lines: `$`
    // under /m ends at the first newline, which silently yields an empty block.
    const stanza = normalize(dsl)
        .split(/^type /m)
        .find((block) => block.startsWith(`${type}\n`) || block.trimEnd() === type);
    expect(stanza, `type ${type} is missing from model.fga`).toBeDefined();
    return stanza!;
};

describe("OpenFGA model freeze", () => {
    it("matches the fingerprint frozen at the model-lock review", () => {
        const actual = crypto.createHash("sha256").update(normalize(dsl)).digest("hex");
        expect(actual, FREEZE_MESSAGE).toBe(MODEL_SHA256);
    });

    // A rename that happened to keep the same byte count would slip past a hash
    // diff report; these assert the exact strings other layers depend on.
    it.each(["file", "folder"])(
        "keeps the four authorize() relations on %s",
        (type) => {
            const relations = relationsOf(type);
            for (const relation of ["can_read", "can_write", "can_share", "can_delete"]) {
                expect(relations, `${type}.${relation} is required by authorize()`).toContain(
                    `define ${relation}:`
                );
            }
            // Share grant roles surfaced in the FE (SHARE_ROLES = editor|viewer).
            expect(relations).toContain("define editor:");
            expect(relations).toContain("define viewer:");
            expect(relations).toContain("define owner:");
        }
    );

    it("keeps public links grantable only as the accessor userset", () => {
        const normalized = normalize(dsl);
        expect(normalized).toContain("type public_link");
        expect(relationsOf("public_link")).toContain("define accessor: [user, user:*]");
        // Never `public_link` bare — the type restriction must be the userset.
        expect(normalized).not.toMatch(/\[[^\]]*\bpublic_link\b(?!#accessor)[^\]]*\]/);
    });
});
