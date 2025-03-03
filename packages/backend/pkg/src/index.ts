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
import type { Mutation } from "@qubit-rs/client";
import type { RefDoc } from "./RefDoc.ts";
import type { Query } from "@qubit-rs/client";
import type { RefContent } from "./RefContent.ts";
import type { Permissions } from "./Permissions.ts";
import type { PermissionLevel } from "./PermissionLevel.ts";
import type { NewPermissions } from "./NewPermissions.ts";
import type { UserSummary } from "./UserSummary.ts";
import type { UsernameStatus } from "./UsernameStatus.ts";
import type { UserProfile } from "./UserProfile.ts";
import type { RefStub } from "./RefStub.ts";
import type { RefQueryParams } from "./RefQueryParams.ts";

export type { RpcResult } from "./RpcResult.ts";
export type { JsonValue } from "./serde_json/JsonValue.ts";
export type { Mutation } from "@qubit-rs/client";
export type { RefDoc } from "./RefDoc.ts";
export type { Query } from "@qubit-rs/client";
export type { RefContent } from "./RefContent.ts";
export type { Permissions } from "./Permissions.ts";
export type { PermissionLevel } from "./PermissionLevel.ts";
export type { NewPermissions } from "./NewPermissions.ts";
export type { UserSummary } from "./UserSummary.ts";
export type { UsernameStatus } from "./UsernameStatus.ts";
export type { UserProfile } from "./UserProfile.ts";
export type { RefStub } from "./RefStub.ts";
export type { RefQueryParams } from "./RefQueryParams.ts";

export type QubitServer = { new_ref: Mutation<[content: JsonValue, ], RpcResult<string>>, get_doc: Query<[ref_id: string, ], RpcResult<RefDoc>>, head_snapshot: Query<[ref_id: string, ], RpcResult<JsonValue>>, save_snapshot: Mutation<[data: RefContent, ], RpcResult<null>>, get_permissions: Query<[ref_id: string, ], RpcResult<Permissions>>, set_permissions: Mutation<[ref_id: string, new: NewPermissions, ], RpcResult<null>>, validate_session: Query<[], RpcResult<null>>, sign_up_or_sign_in: Mutation<[], RpcResult<null>>, user_by_username: Query<[username: string, ], RpcResult<UserSummary | null>>, username_status: Query<[username: string, ], RpcResult<UsernameStatus>>, get_active_user_profile: Query<[], RpcResult<UserProfile>>, set_active_user_profile: Mutation<[user: UserProfile, ], RpcResult<null>>, get_ref_stubs: Query<[query_params: RefQueryParams, ], RpcResult<Array<RefStub>>>, get_ref_stubs_related_to_user: Query<[query_params: RefQueryParams, ], RpcResult<Array<RefStub>>> };