// adapted from https://github.com/automerge/automerge-repo/blob/main/packages/automerge-repo/src/helpers/tests/storage-adapter-tests.ts

import type { StorageAdapterInterface } from "@automerge/automerge-repo"
import { describe, expect, it } from "vitest"


const PAYLOAD_A = () => new Uint8Array([0, 1, 127, 99, 154, 235])
const PAYLOAD_B = () => new Uint8Array([1, 76, 160, 53, 57, 10, 230])
const PAYLOAD_C = () => new Uint8Array([2, 111, 74, 131, 236, 96, 142, 193])

const LARGE_PAYLOAD = new Uint8Array(100000).map(() => Math.random() * 256)

export function runStorageAdapterTests(_setup: SetupFn, title?: string): void {
  const setup = async () => {
    const { adapter, teardown } = await _setup()
    return { adapter, teardown }
  }

  describe(`Storage adapter acceptance tests ${
    title ? `(${title})` : ""
  }`, () => {
    describe("load", () => {
      it("should return undefined if there is no data", async () => {
        const { adapter, teardown } = await setup()

        const actual = await adapter.load(["AAAAA", "sync-state", "xxxxx"])
        expect(actual).toBeUndefined()

         await teardown()
      })
    })

    describe("save and load", () => {
      it("should return data that was saved", async () => {
        const { adapter, teardown } = await setup()

        await adapter.save(["storage-adapter-id"], PAYLOAD_A())
        const actual = await adapter.load(["storage-adapter-id"])
        expect(actual).toStrictEqual(PAYLOAD_A())

         await teardown()
      })

      it("should work with composite keys", async () => {
        const { adapter, teardown } = await setup()

        await adapter.save(["AAAAA", "sync-state", "xxxxx"], PAYLOAD_A())
        const actual = await adapter.load(["AAAAA", "sync-state", "xxxxx"])
        expect(actual).toStrictEqual(PAYLOAD_A())

         await teardown()
      })

      it("should work with a large payload", async () => {
        const { adapter, teardown } = await setup()

        await adapter.save(["AAAAA", "sync-state", "xxxxx"], LARGE_PAYLOAD)
        const actual = await adapter.load(["AAAAA", "sync-state", "xxxxx"])
        expect(actual).toStrictEqual(LARGE_PAYLOAD)

         await teardown()
      })
    })

    describe("loadRange", () => {
      it("should return an empty array if there is no data", async () => {
        const { adapter, teardown } = await setup()

        expect(await adapter.loadRange(["AAAAA"])).toStrictEqual([])

         await teardown()
      })
    })

    describe("save and loadRange", () => {
      it("should return all the data that matches the key", async () => {
        const { adapter, teardown } = await setup()

        await adapter.save(["AAAAA", "sync-state", "xxxxx"], PAYLOAD_A())
        await adapter.save(["AAAAA", "snapshot", "yyyyy"], PAYLOAD_B())
        await adapter.save(["AAAAA", "sync-state", "zzzzz"], PAYLOAD_C())

        expect(await adapter.loadRange(["AAAAA"])).toStrictEqual(
          expect.arrayContaining([
            { key: ["AAAAA", "sync-state", "xxxxx"], data: PAYLOAD_A() },
            { key: ["AAAAA", "snapshot", "yyyyy"], data: PAYLOAD_B() },
            { key: ["AAAAA", "sync-state", "zzzzz"], data: PAYLOAD_C() },
          ])
        )

        expect(await adapter.loadRange(["AAAAA", "sync-state"])).toStrictEqual(
          expect.arrayContaining([
            { key: ["AAAAA", "sync-state", "xxxxx"], data: PAYLOAD_A() },
            { key: ["AAAAA", "sync-state", "zzzzz"], data: PAYLOAD_C() },
          ])
        )

         await teardown()
      })

      it("should only load values that match they key", async () => {
        const { adapter, teardown } = await setup()

        await adapter.save(["AAAAA", "sync-state", "xxxxx"], PAYLOAD_A())
        await adapter.save(["BBBBB", "sync-state", "zzzzz"], PAYLOAD_C())

        const actual = await adapter.loadRange(["AAAAA"])
        expect(actual).toStrictEqual(
          expect.arrayContaining([
            { key: ["AAAAA", "sync-state", "xxxxx"], data: PAYLOAD_A() },
          ])
        )
        expect(actual).toStrictEqual(
          expect.not.arrayContaining([
            { key: ["BBBBB", "sync-state", "zzzzz"], data: PAYLOAD_C() },
          ])
        )

         await teardown()
      })
    })

    describe("save and remove", () => {
      it("after removing, should be empty", async () => {
        const { adapter, teardown } = await setup()

        await adapter.save(["AAAAA", "snapshot", "xxxxx"], PAYLOAD_A())
        await adapter.remove(["AAAAA", "snapshot", "xxxxx"])

        expect(await adapter.loadRange(["AAAAA"])).toStrictEqual([])
        expect(
          await adapter.load(["AAAAA", "snapshot", "xxxxx"])
        ).toBeUndefined()

         await teardown()
      })
    })

    describe("save and save", () => {
      it("should overwrite data saved with the same key", async () => {
        const { adapter, teardown } = await setup()

        await adapter.save(["AAAAA", "sync-state", "xxxxx"], PAYLOAD_A())
        await adapter.save(["AAAAA", "sync-state", "xxxxx"], PAYLOAD_B())

        expect(await adapter.loadRange(["AAAAA", "sync-state"])).toStrictEqual([
          { key: ["AAAAA", "sync-state", "xxxxx"], data: PAYLOAD_B() },
        ])

         await teardown()
      })
    })

    describe("removeRange", () => {
      it("should remove a range of records", async () => {
        const { adapter, teardown } = await setup()

        await adapter.save(["AAAAA", "sync-state", "xxxxx"], PAYLOAD_A())
        await adapter.save(["AAAAA", "snapshot", "yyyyy"], PAYLOAD_B())
        await adapter.save(["AAAAA", "sync-state", "zzzzz"], PAYLOAD_C())

        await adapter.removeRange(["AAAAA", "sync-state"])

        expect(await adapter.loadRange(["AAAAA"])).toStrictEqual([
          { key: ["AAAAA", "snapshot", "yyyyy"], data: PAYLOAD_B() },
        ])

         await teardown()
      })

      it("should not remove records that don't match", async () => {
        const { adapter, teardown } = await setup()

        await adapter.save(["AAAAA", "sync-state", "xxxxx"], PAYLOAD_A())
        await adapter.save(["BBBBB", "sync-state", "zzzzz"], PAYLOAD_B())

        await adapter.removeRange(["AAAAA"])

        const actual = await adapter.loadRange(["BBBBB"])
        expect(actual).toStrictEqual([
          { key: ["BBBBB", "sync-state", "zzzzz"], data: PAYLOAD_B() },
        ])

         await teardown()
      })
    })
  })
}

export type SetupFn = () => Promise<{
  adapter: StorageAdapterInterface
  teardown: () => Promise<void>
}>
