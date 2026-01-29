use serde::{Deserialize, Serialize};

use crate::document::RefStub;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserState {
    documents: Vec<RefStub>,
}

#[cfg(test)]
mod tests {
type UserStateSQL<'q> = sqlx::query::Query<'q, sqlx::Postgres, sqlx::postgres::PgArguments>;
}
