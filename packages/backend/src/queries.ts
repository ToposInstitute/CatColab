/** Types generated for queries found in "src/queries.sql" */
import { PreparedQuery } from "@pgtyped/runtime";

/** 'Autosave' parameters type */
export interface IAutosaveParams {
    refId?: string | null | void;
    snapshotId?: number | null | void;
}

/** 'Autosave' return type */
export type IAutosaveResult = void;

/** 'Autosave' query type */
export interface IAutosaveQuery {
    params: IAutosaveParams;
    result: IAutosaveResult;
}

const autosaveIR: any = {
    usedParamSet: { snapshotId: true, refId: true },
    params: [
        {
            name: "snapshotId",
            required: false,
            transform: { type: "scalar" },
            locs: [{ a: 27, b: 37 }],
        },
        { name: "refId", required: false, transform: { type: "scalar" }, locs: [{ a: 71, b: 76 }] },
    ],
    statement: "UPDATE refs\nSET autosave = :snapshotId, lastUpdated = NOW()\nWHERE id = :refId",
};

/**
 * Query generated from SQL:
 * ```
 * UPDATE refs
 * SET autosave = :snapshotId, lastUpdated = NOW()
 * WHERE id = :refId
 * ```
 */
export const autosave = new PreparedQuery<IAutosaveParams, IAutosaveResult>(autosaveIR);

/** 'GetAutosave' parameters type */
export interface IGetAutosaveParams {
    refId?: string | null | void;
}

/** 'GetAutosave' return type */
export interface IGetAutosaveResult {
    content: string;
}

/** 'GetAutosave' query type */
export interface IGetAutosaveQuery {
    params: IGetAutosaveParams;
    result: IGetAutosaveResult;
}

const getAutosaveIR: any = {
    usedParamSet: { refId: true },
    params: [
        {
            name: "refId",
            required: false,
            transform: { type: "scalar" },
            locs: [{ a: 115, b: 120 }],
        },
    ],
    statement:
        "SELECT snapshots.content as content\nFROM refs\nINNER JOIN snapshots ON refs.autosave = snapshots.id\nWHERE refs.id = :refId",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT snapshots.content as content
 * FROM refs
 * INNER JOIN snapshots ON refs.autosave = snapshots.id
 * WHERE refs.id = :refId
 * ```
 */
export const getAutosave = new PreparedQuery<IGetAutosaveParams, IGetAutosaveResult>(getAutosaveIR);

/** 'GetRefMeta' parameters type */
export interface IGetRefMetaParams {
    refId?: string | null | void;
}

/** 'GetRefMeta' return type */
export interface IGetRefMetaResult {
    title: string | null;
}

/** 'GetRefMeta' query type */
export interface IGetRefMetaQuery {
    params: IGetRefMetaParams;
    result: IGetRefMetaResult;
}

const getRefMetaIR: any = {
    usedParamSet: { refId: true },
    params: [
        { name: "refId", required: false, transform: { type: "scalar" }, locs: [{ a: 34, b: 39 }] },
    ],
    statement: "SELECT title FROM refs WHERE id = :refId",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT title FROM refs WHERE id = :refId
 * ```
 */
export const getRefMeta = new PreparedQuery<IGetRefMetaParams, IGetRefMetaResult>(getRefMetaIR);

/** 'GetRefs' parameters type */
export type IGetRefsParams = void;

/** 'GetRefs' return type */
export interface IGetRefsResult {
    id: string;
    title: string | null;
}

/** 'GetRefs' query type */
export interface IGetRefsQuery {
    params: IGetRefsParams;
    result: IGetRefsResult;
}

const getRefsIR: any = {
    usedParamSet: {},
    params: [],
    statement: "SELECT id, title\nFROM refs\nORDER BY lastUpdated DESC",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, title
 * FROM refs
 * ORDER BY lastUpdated DESC
 * ```
 */
export const getRefs = new PreparedQuery<IGetRefsParams, IGetRefsResult>(getRefsIR);

/** 'GetWitnesses' parameters type */
export interface IGetWitnessesParams {
    refId?: string | null | void;
}

/** 'GetWitnesses' return type */
export interface IGetWitnessesResult {
    attime: Date;
    id: number;
    note: string | null;
    snapshot: number;
}

/** 'GetWitnesses' query type */
export interface IGetWitnessesQuery {
    params: IGetWitnessesParams;
    result: IGetWitnessesResult;
}

const getWitnessesIR: any = {
    usedParamSet: { refId: true },
    params: [
        { name: "refId", required: false, transform: { type: "scalar" }, locs: [{ a: 64, b: 69 }] },
    ],
    statement:
        "SELECT id, snapshot, note, atTime FROM witnesses WHERE forRef = :refId ORDER BY atTime",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, snapshot, note, atTime FROM witnesses WHERE forRef = :refId ORDER BY atTime
 * ```
 */
export const getWitnesses = new PreparedQuery<IGetWitnessesParams, IGetWitnessesResult>(
    getWitnessesIR,
);

/** 'NewRef' parameters type */
export interface INewRefParams {
    title?: string | null | void;
}

/** 'NewRef' return type */
export interface INewRefResult {
    id: string;
}

/** 'NewRef' query type */
export interface INewRefQuery {
    params: INewRefParams;
    result: INewRefResult;
}

const newRefIR: any = {
    usedParamSet: { title: true },
    params: [
        { name: "title", required: false, transform: { type: "scalar" }, locs: [{ a: 68, b: 73 }] },
    ],
    statement:
        "INSERT INTO refs(id, title, lastUpdated)\nVALUES (gen_random_uuid(), :title, NOW())\nRETURNING id",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO refs(id, title, lastUpdated)
 * VALUES (gen_random_uuid(), :title, NOW())
 * RETURNING id
 * ```
 */
export const newRef = new PreparedQuery<INewRefParams, INewRefResult>(newRefIR);

/** 'NewSnapshot' parameters type */
export interface INewSnapshotParams {
    content?: string | null | void;
}

/** 'NewSnapshot' return type */
export interface INewSnapshotResult {
    id: number;
}

/** 'NewSnapshot' query type */
export interface INewSnapshotQuery {
    params: INewSnapshotParams;
    result: INewSnapshotResult;
}

const newSnapshotIR: any = {
    usedParamSet: { content: true },
    params: [
        {
            name: "content",
            required: false,
            transform: { type: "scalar" },
            locs: [
                { a: 55, b: 62 },
                { a: 88, b: 95 },
            ],
        },
    ],
    statement:
        "INSERT INTO snapshots(hash, content)\n    VALUES(digest(:content::text, 'sha256'::text), :content)\n    ON CONFLICT (hash) DO UPDATE SET\n    hash = EXCLUDED.hash\n    RETURNING id",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO snapshots(hash, content)
 *     VALUES(digest(:content::text, 'sha256'::text), :content)
 *     ON CONFLICT (hash) DO UPDATE SET
 *     hash = EXCLUDED.hash
 *     RETURNING id
 * ```
 */
export const newSnapshot = new PreparedQuery<INewSnapshotParams, INewSnapshotResult>(newSnapshotIR);

/** 'SaveRef' parameters type */
export interface ISaveRefParams {
    note?: string | null | void;
    refId?: string | null | void;
}

/** 'SaveRef' return type */
export interface ISaveRefResult {
    id: number;
}

/** 'SaveRef' query type */
export interface ISaveRefQuery {
    params: ISaveRefParams;
    result: ISaveRefResult;
}

const saveRefIR: any = {
    usedParamSet: { refId: true, note: true },
    params: [
        {
            name: "refId",
            required: false,
            transform: { type: "scalar" },
            locs: [
                { a: 71, b: 76 },
                { a: 118, b: 123 },
            ],
        },
        { name: "note", required: false, transform: { type: "scalar" }, locs: [{ a: 79, b: 83 }] },
    ],
    statement:
        "INSERT INTO witnesses(snapshot, forRef, note, atTime)\nSELECT autosave, :refId, :note, NOW() FROM refs WHERE refs.id = :refId\nRETURNING id",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO witnesses(snapshot, forRef, note, atTime)
 * SELECT autosave, :refId, :note, NOW() FROM refs WHERE refs.id = :refId
 * RETURNING id
 * ```
 */
export const saveRef = new PreparedQuery<ISaveRefParams, ISaveRefResult>(saveRefIR);
