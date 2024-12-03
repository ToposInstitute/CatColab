/* eslint-disable */
// @ts-nocheck
/*    @@@@@@@@@@@@@ & ###############
   @@@@@@@@@@@@@@ &&& ###############
 @@@@@@@@@@@@@@ &&&&& ###############
############### &&&&& ###############
######## Generated by Qubit! ########
############### &&&&& ###############
############### &&&&& @@@@@@@@@@@@@@
############### && @@@@@@@@@@@@@@
############### & @@@@@@@@@@@@@    */

import type { RpcResult } from "./RpcResult.ts";
import type { JsonValue } from "./serde_json/JsonValue.ts";
import type { Permissions } from "./Permissions.ts";
import type { NewRef } from "./NewRef.ts";
import type { Mutation } from "@qubit-rs/client";
import type { RefDoc } from "./RefDoc.ts";
import type { Query } from "@qubit-rs/client";
import type { RefContent } from "./RefContent.ts";

export type { RpcResult } from "./RpcResult.ts";
export type { JsonValue } from "./serde_json/JsonValue.ts";
export type { Permissions } from "./Permissions.ts";
export type { NewRef } from "./NewRef.ts";
export type { Mutation } from "@qubit-rs/client";
export type { RefDoc } from "./RefDoc.ts";
export type { Query } from "@qubit-rs/client";
export type { RefContent } from "./RefContent.ts";

export type QubitServer = { new_ref: Mutation<[input: NewRef, ], RpcResult<string>>, get_doc: Query<[ref_id: string, ], RpcResult<RefDoc>>, head_snapshot: Query<[ref_id: string, ], RpcResult<JsonValue>>, save_snapshot: Mutation<[data: RefContent, ], RpcResult<null>>, sign_up_or_sign_in: Mutation<[], RpcResult<null>> };