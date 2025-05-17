use sqlx::{Connection, PgConnection};
use sqlx_migrator::cli::MigrationCommand;
use sqlx_migrator::migrator::{Info, Migrator};

use catcolab_backend::migrations;

#[tokio::main]
async fn main() {
    let database_url = std::env::var("DATABASE_URL").unwrap();
    let mut conn = PgConnection::connect(&database_url).await.unwrap();

    let mut migrator = Migrator::default();
    migrator.add_migrations(migrations::migrations()).unwrap();

    MigrationCommand::parse_and_run(&mut conn, Box::new(migrator)).await.unwrap();
}
