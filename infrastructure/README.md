# Infrastructure

We have two deployments the application, one for production which runs the latest release (by tagged
version), and one for staging which runs the main branch. The application is split into frontend and
backend, with the frontend hosted on netlify and the backend for each deployment hosted on separate AWS
EC2 instances.

- Production deployment `catcolab`
  * frontend: `catcolab.org`
  * backend: `backend.catcolab.org`
- Staging deployment `catcolab-next`
  * frontend: `next.catcolab.org`
  * backend: `backend-next.catcolab.org`


## PR Previews

The `netlify-preview` preview links that are added to each pull request only contain changes to the
frontend, the previews will connect to the staging backend at `backend-next.catcolab.org`. This leads to
the previews being unreliable when the PR includes changes to the backend.

## Changing the system configuration

The system configuration for our backend deployments is configured via nix, in the `infrastructure/`
part of the repo. System configuration changes should be submitted as pull requests and follow the same
deployment process as the rest of the application.

### Manual backend deploys

In the event that you need to deploy changes to one of the backendend hosts without going through the
normal deploy process, this can be done by running

```
deploy .#catcolab-next
```

## Initializing the AWS instance

See `infrastructure/ec2-setup.md`.

## Running the services locally

If you are doing development work and want to run the automerge doc service and backend web service locally on your machine, you do not need to use systemd to run the services in the background. Instead, it might be easier to use `tmux` for running and monitoring the services.

Setting up the Postgres database locally:

1. Assumptions: There is a `postgres` user on the machine. The cluster does not contain a `catcolab` user or a `catcolab` database. Rust and cargo are installed.
1. Get the `DATABASE_URL` from the decrypted `.env.age` file.
  - In `infrastructure/secrets/`, run `nix develop` followed by `EDITOR=vim agenix -e .env.age`. You should change the `EDITOR` variable to your preferred editor tool.

1. In `infrastructure/scripts`, run `su -m postgres -- ./initdb.sh "<DATABASE_URL>"`.
1. Run migrations on the database:
  - Install `sqlx-cli` with `cargo install sqlx-cli`
  - In `packages/backend/`, run `~/.cargo/bin/sqlx migrate run`
