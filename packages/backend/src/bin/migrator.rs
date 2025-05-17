use sqlx::{Connection, PgConnection};
use sqlx_migrator::Info;
use sqlx_migrator::cli::MigrationCommand;
use sqlx_migrator::migrator::Migrator;

#[tokio::main]
async fn main() {
    let database_url = std::env::var("DATABASE_URL").expect("`DATABASE_URL` must be set");

    let mut migrator = Migrator::default();
    migrator
        .add_migrations(catcolab_backend::migrations::migrations())
        .expect("Failed to load migrations");

    let mut conn = PgConnection::connect(&database_url)
        .await
        .expect("Failed to connect to database");

    MigrationCommand::parse_and_run(&mut conn, Box::new(migrator)).await.unwrap();
}
