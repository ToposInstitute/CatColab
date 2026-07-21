use super::api::Link;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tsify::Tsify;
use uuid::Uuid;

/// A supported inline file type.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum FileType {
    CSV,
}

/// A file stored inline with a user message.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct InlineFile {
    pub filename: String,
    #[serde(rename = "fileType")]
    pub file_type: FileType,
    pub content: Vec<u8>,
}

/// The result of executing code requested by the LLM.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum EvalResult {
    Ok { value: String },
    Err { error: String },
}

/// A message submitted by the user.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct UserMessage {
    pub timestamp: String,
    pub id: Uuid,
    pub content: String,
    pub files: Vec<InlineFile>,
}

/// A completed textual response from the LLM.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LLMMessage {
    pub timestamp: String,
    pub id: Uuid,
    pub content: String,
}

/// A `contextExec` call and its completed result.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LLMCodeExecution {
    pub timestamp: String,
    pub id: Uuid,
    #[serde(rename = "toolCallId")]
    pub tool_call_id: String,
    pub code: String,
    pub result: EvalResult,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transaction: Option<Value>,
}

/// The user's resolution of a feedback request.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "lowercase")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum FeedbackResolution {
    Unresolved,
    Approved,
    Rejected,
}

/// A request for the user to approve or reject a proposed transaction.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct UserFeedbackRequest {
    pub timestamp: String,
    pub id: Uuid,
    #[serde(rename = "codeExecution")]
    pub code_execution: Uuid,
    pub content: String,
    pub resolution: FeedbackResolution,
}

/// An interaction in an LLM conversation.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[serde(tag = "tag")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum LLMInteraction {
    #[serde(rename = "user-message")]
    UserMessage(UserMessage),
    #[serde(rename = "llm-message")]
    LLMMessage(LLMMessage),
    #[serde(rename = "llm-code-execution")]
    LLMCodeExecution(LLMCodeExecution),
    #[serde(rename = "user-feedback-request")]
    UserFeedbackRequest(UserFeedbackRequest),
}

/// A sequential conversation attached to a CatColab model.
#[derive(PartialEq, Eq, Debug, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LLMConversationDocumentContent {
    pub name: String,
    #[serde(rename = "llmConversationOf")]
    pub conversation_of: Link,
    #[serde(rename = "llmModel")]
    pub llm_model: String,
    pub interactions: Vec<LLMInteraction>,
    pub version: String,
}
