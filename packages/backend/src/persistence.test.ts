import { Persistence } from "./persistence.js";
import { test, it } from "node:test"
import assert from "node:assert"

test('Persistence API', async (_t) => {
    const url = process.env.TEST_DATABASE_URL
    if (!url) {
        assert.fail("must supply connection string with environment variable TEST_DATABASE_URL")
    }
    const p = new Persistence(url)
    await p.teardown('./migrations')
    await p.migrate('./migrations')

    const h1 = await p.saveSnapshot('snapshot1')
    const h2 = await p.saveSnapshot('snapshot1')

    await it('should return id as an integer', () => {
        assert.strictEqual(typeof h1, 'number')
        assert.strictEqual(typeof h2, 'number')
    })

    await it('should deduplicate', () => {
        assert.strictEqual(h1, h2)
    })

    p.close()
})
