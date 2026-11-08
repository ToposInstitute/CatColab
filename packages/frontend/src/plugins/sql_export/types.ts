export enum SQLBackend {
    MySQL = "MySQL",
    SQLite = "SQLite",
    PostgresSQL = "PostgresSQL",
}

export type DownloadConfig = {
    backend: SQLBackend;
    filename: string;
};

export const defaultDownloadConfig = (): DownloadConfig => ({
    backend: SQLBackend.PostgresSQL,
    filename: "schema.sql",
});
