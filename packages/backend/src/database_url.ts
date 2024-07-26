import * as fs from "node:fs";

export function getDatabaseUrl(): string {
    if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    } else if (process.env.DATABASE_URL_PATH) {
        return fs.readFileSync(process.env.DATABASE_URL_PATH, { encoding: "utf-8" });
    } else {
        throw "neither DATABASE_URL nor DATABASE_URL_PATH provided";
    }
}
