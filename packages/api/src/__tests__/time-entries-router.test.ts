import type { Session } from "@hourino/auth";
import type { AuthServices } from "@hourino/auth/composition";
import type { Database } from "@hourino/db";
import { TRPCError } from "@trpc/server";
import { generateOpenApiDocument } from "trpc-to-openapi";
import { describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { appRouter } from "../routers/index";
import { daysBetween, escapeLike, isUniqueViolation } from "../routers/shared";

const SESSION_TTL_MS = 60 * 60 * 1000;
const CATEGORY_ID = "0b5c4a55-6f7e-4a4e-9a4b-3f7c2d1e0a11";
const ENTRY_ID = "5e0b8a2c-1d3f-4c6b-8e9a-2b4d6f8a0c13";

const fakeSession = {
	session: { expiresAt: new Date(Date.now() + SESSION_TTL_MS), id: "sess_1" },
	user: { email: "ada@example.com", id: "user_1", name: "Ada Lovelace" },
} as unknown as Session;

/**
 * The db is a Proxy that fails the test on any access: every case below must
 * be rejected by auth or input validation before a query is ever built.
 */
function createContext(session: Session | null = fakeSession): Context {
	const db = new Proxy(
		{},
		{
			get: (_target, property) => {
				throw new Error(`db.${String(property)} must not be reached`);
			},
		}
	) as Database;

	return {
		authServices: {} as AuthServices,
		cookies: { setCookies: vi.fn() },
		db,
		requestHeaders: new Headers(),
		session,
		webOrigin: "http://localhost:3001",
	};
}

const caller = (ctx: Context) => appRouter.createCaller(ctx);

async function expectTrpcCode(
	promise: Promise<unknown>,
	code: TRPCError["code"]
) {
	const error = await promise.then(
		() => null,
		(caught: unknown) => caught
	);
	expect(error).toBeInstanceOf(TRPCError);
	expect((error as TRPCError).code).toBe(code);
}

const validEntry = {
	endMinute: 630,
	startMinute: 540,
	workDate: "2026-09-23",
};

describe("auth guard", () => {
	it.each([
		[
			"timeEntries.list",
			() =>
				caller(createContext(null)).timeEntries.list({
					from: "2026-09-01",
					to: "2026-10-01",
				}),
		],
		[
			"timeEntries.create",
			() => caller(createContext(null)).timeEntries.create(validEntry),
		],
		[
			"timeEntries.delete",
			() => caller(createContext(null)).timeEntries.delete({ id: ENTRY_ID }),
		],
		["categories.list", () => caller(createContext(null)).categories.list({})],
		[
			"categories.getById",
			() => caller(createContext(null)).categories.getById({ id: CATEGORY_ID }),
		],
		[
			"categories.restore",
			() => caller(createContext(null)).categories.restore({ id: CATEGORY_ID }),
		],
		[
			"timeEntries.getById",
			() => caller(createContext(null)).timeEntries.getById({ id: ENTRY_ID }),
		],
		[
			"categories.create",
			() => caller(createContext(null)).categories.create({ name: "Meetings" }),
		],
	])("%s requires a session", async (_name, call) => {
		await expectTrpcCode(call(), "UNAUTHORIZED");
	});
});

describe("timeEntries.create validation", () => {
	it.each([
		["end before start", { ...validEntry, endMinute: 500 }],
		["zero-length entry", { ...validEntry, endMinute: 540 }],
		["end past midnight", { ...validEntry, endMinute: 1441 }],
		["negative start", { ...validEntry, startMinute: -1 }],
		["fractional minute", { ...validEntry, startMinute: 540.5 }],
		["malformed date", { ...validEntry, workDate: "23/09/2026" }],
		["impossible date", { ...validEntry, workDate: "2026-02-30" }],
		["date outside partition range", { ...validEntry, workDate: "1999-12-31" }],
		["non-uuid category", { ...validEntry, categoryIds: ["nope"] }],
		[
			"too many categories",
			{
				...validEntry,
				categoryIds: Array.from(
					{ length: 11 },
					(_, i) =>
						`0b5c4a55-6f7e-4a4e-9a4b-3f7c2d1e0a${String(i).padStart(2, "0")}`
				),
			},
		],
	])("rejects %s", async (_name, input) => {
		await expectTrpcCode(
			caller(createContext()).timeEntries.create(input),
			"BAD_REQUEST"
		);
	});
});

describe("timeEntries.list validation", () => {
	it.each([
		["to before from", { from: "2026-09-10", to: "2026-09-01" }],
		["empty window", { from: "2026-09-10", to: "2026-09-10" }],
		["window wider than 42 days", { from: "2026-09-01", to: "2026-10-14" }],
		["blank search", { from: "2026-09-01", search: "   ", to: "2026-09-08" }],
		[
			"non-uuid category filter",
			{ categoryIds: ["x"], from: "2026-09-01", to: "2026-09-08" },
		],
	])("rejects %s", async (_name, input) => {
		await expectTrpcCode(
			caller(createContext()).timeEntries.list(input),
			"BAD_REQUEST"
		);
	});
});

describe("categories validation", () => {
	it("rejects colors outside the curated palette", async () => {
		await expectTrpcCode(
			caller(createContext()).categories.create({
				// @ts-expect-error — not a palette key
				color: "#ff0000",
				name: "Meetings",
			}),
			"BAD_REQUEST"
		);
	});

	it("rejects blank and over-long names", async () => {
		await expectTrpcCode(
			caller(createContext()).categories.create({ name: "   " }),
			"BAD_REQUEST"
		);
		await expectTrpcCode(
			caller(createContext()).categories.update({
				id: CATEGORY_ID,
				name: "x".repeat(41),
			}),
			"BAD_REQUEST"
		);
	});
});

describe("categories.list validation", () => {
	it.each([
		["unknown color filter", { colors: ["neon"] }],
		["page size above the cap", { limit: 101 }],
		["zero page size", { limit: 0 }],
		["negative offset", { offset: -1 }],
		["unknown status", { status: "archived" }],
		["unknown sort column", { sortBy: "color" }],
		["blank search", { search: "  " }],
	])("rejects %s", async (_name, input) => {
		await expectTrpcCode(
			caller(createContext()).categories.list(input as never),
			"BAD_REQUEST"
		);
	});
});

describe("getById validation", () => {
	it("rejects non-uuid ids", async () => {
		await expectTrpcCode(
			caller(createContext()).categories.getById({ id: "1" }),
			"BAD_REQUEST"
		);
		await expectTrpcCode(
			caller(createContext()).timeEntries.getById({ id: "1" }),
			"BAD_REQUEST"
		);
	});
});

describe("shared helpers", () => {
	it("counts whole days across month and DST boundaries", () => {
		expect(daysBetween("2026-09-01", "2026-10-13")).toBe(42);
		expect(daysBetween("2026-10-20", "2026-11-05")).toBe(16);
	});

	it("escapes LIKE wildcards", () => {
		expect(escapeLike(String.raw`50%_off\now`)).toBe(
			String.raw`50\%\_off\\now`
		);
	});

	it("finds a unique violation wrapped in a cause chain", () => {
		expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
		expect(isUniqueViolation({ cause: { code: "23503" } })).toBe(false);
		expect(isUniqueViolation(new Error("boom"))).toBe(false);
	});
});

describe("OpenAPI document", () => {
	it("documents the category and time-entry REST routes", () => {
		const document = generateOpenApiDocument(appRouter, {
			baseUrl: "http://localhost:3000/api/rest",
			title: "test",
			version: "0.0.0",
		});
		const paths = Object.keys(document.paths ?? {});
		expect(paths).toEqual(
			expect.arrayContaining([
				"/categories",
				"/categories/{id}",
				"/categories/{id}/restore",
				"/time-entries",
				"/time-entries/{id}",
			])
		);
		const listParams = (
			document.paths?.["/time-entries"]?.get?.parameters ?? []
		).map((parameter) => ("name" in parameter ? parameter.name : ""));
		expect(listParams).toEqual(
			expect.arrayContaining(["from", "to", "categoryIds", "search"])
		);
		expect(Object.keys(document.paths?.["/categories/{id}"] ?? {})).toEqual(
			expect.arrayContaining(["get", "patch", "delete"])
		);
		expect(Object.keys(document.paths?.["/time-entries/{id}"] ?? {})).toEqual(
			expect.arrayContaining(["get", "patch", "delete"])
		);
		const categoryParams = (
			document.paths?.["/categories"]?.get?.parameters ?? []
		).map((parameter) => ("name" in parameter ? parameter.name : ""));
		expect(categoryParams).toEqual(
			expect.arrayContaining([
				"search",
				"colors",
				"status",
				"sortBy",
				"sortOrder",
				"limit",
				"offset",
			])
		);
	});
});
