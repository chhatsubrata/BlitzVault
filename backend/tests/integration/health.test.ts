import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app";

describe("health routes", () => {
    it("GET /healthz returns 200 with status ok + uptime", async () => {
        const res = await request(app).get("/healthz");

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe("ok");
        expect(typeof res.body.data.uptime).toBe("number");
    });

    it("GET /readyz returns 200 ready when DB is initialized", async () => {
        // tests/setup.ts initializes AppDataSource before the suite.
        const res = await request(app).get("/readyz");

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe("ready");
    });
});
