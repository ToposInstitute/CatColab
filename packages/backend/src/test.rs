use sqlx::PgPool; // Import PgPool for PostgreSQL connection
use std::env;

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    // Set up the database connection pool
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPool::connect(&database_url).await?;

    // Execute the query and fetch results
    let rows = sqlx::query("SELECT * FROM Catcolab LIMIT 5")
        .fetch_all(&pool)
        .await?;

    // Print each row
    for row in rows {
        println!("{:?}", row);
    }

    Ok(())
}
