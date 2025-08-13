# Infrastructure

We have two AWS instances or hosts that each run (possibly different versions of) both the backend web service and the automerge doc service. The hosts and services are named:

- Production instance `catcolab`
  * backend.catcolab.org
  * automerge.catcolab.org
- Development instance `catcolab-next`
  * backend-next.catcolab.org
  * automerge-next.catcolab.org

For example, the domain names `backend-next.catcolab.org` and `automerge-next.catcolab.org` point to the `catcolab-next` instance but are routed to different ports. These web and doc services can be used by the frontend hosted at `next.catcolab.org`, or by a dev client.

Note that this means that PR previews only are for the frontend. So if a PR introduces significant changes to the backend services, the PR preview won't see those backend changes because it will still be pointing to whatever version of the backend is running on the instance. Fortunately, we don't expect the backend to change all too much, at least compared to the frontend; it just serves blobs without caring about what's in the blobs.


## Changing the system configuration

The system configuration of this instance is configured via nix, in the `infrastructure/` part of the repo. In order to change the system configuration (e.g. add system packages, add new users), make sure that your ssh key is enabled for root access to the instance (ask Evan for this). Then run:

1. `nix develop`
1. `deploy .#catcolab`

However, this will not update the version of catcolab that is running on the instance. There is currently a somewhat manual process to do this, because Owen believes that it is important for people to understand the steps of the manual process so that they can debug things when they go wrong.


## Upgrading the CatColab version

On each AWS instance, there is a git clone of the catcolab repository in `/var/lib/catcolab`. There is a daemon (managed via systemd) that runs the automerge doc service, and another daemon that runs the backend web service. In order to upgrade the version of catcolab associated with both services on the instance, one should:

1. Log in via `ssh catcolab@backend-next.catcolab.org` or `ssh catcolab@<instance ip address>`. Do **not** log in as `root`. If you don't have access, ask Evan.
1. In `/var/lib/catcolab/`, use `git` to checkout the desired version of catcolab.
1. Run `catcolab-build` to produce a new binaries for the automerge doc service (Node) and the backend web service (Rust).
1. Run `catcolab-stop`; this will temporarily stop both the automerge and backend services.
1. Run `catcolab-migrate`. This will update the database with new any migrations that have been added since the last time the database was migrated.
1. Run `catcolab-start`; this will start back up both the automerge and backend services.
1. If there are no new migrations, run `catcolab-restart` to simply stop-then-start the services.
1. If you want to check the status of the two services, run `catcolab-status`.
1. If you want to look under the hood and see what the above `catcolab-*` scripts are doing, check out `infrastructure/scripts`.


## Debugging the backend services

1. To look at the log messages, run `journalctl -eu automerge` or `journalctl -eu backend` depending on the desired service.
1. In the log messages, be aware that the latest error messages may come from systemd trying to restore an old deployment after a new deployment has failed. Scroll up the logs and look at the log timestamps to find the errors that come from your latest tests.
1. To get the path of the script that systemd ran for, say, the automerge service, run `systemctl status automerge` and look at the `CGroup` field. The script path could be something like `/nix/store/4360f6br044ncwzs75qhn79g45j8qss1-automerge.sh`. Running this script separately can help in debugging. Remember to set the working directory and environment variables so that the script runs in the right context. You can get this contextual information from files like `infrastructure/hosts/*/backend.nix`.


## Instance access for new users

To give a new user access to an AWS instance, e.g. `catcolab-next`:

1. Update the public keys in `infrastructure/hosts/catcolab-next/default.nix`. Remember to update the permissions for the new user as well.
1. Get someone with instance access to run `nix develop` then `deploy .#catcolab-next` in the `infrastructure` folder.
1. Commit and push the changes to the repository.


## Secrets access for new users

To give a new user access to the secrets:

1. Update the public keys in `infrastructure/secrets/secrets.nix`. Remember to update the permissions for the new user as well.
1. Get someone with secret access to run `nix develop` in the `infrastructure` folder, then `agenix -r` in the `infrastructure/secrets` folder.
1. Commit and push the changes to the repository.


## Initializing the AWS instance

If you are creating an AWS instance and setting up a CatColab backend, e.g. `backend-next`, for the first time:

1. Create an instance on AWS:
  - Use a community AMI of the form `nixos/24.05.????.????????????-x86_64-linux`.
  - Instance type is `t3.medium`.
  - Select "Allow HTTPS traffic.." and "Allow HTTP traffic.." in addition to the already selected "Allow SSH traffic from Anywhere".
  - Add 50GB of storage to the instance.
1. On the `namecheap` domain name hosting service, point `backend-next.catcolab.org` to the instance IP address.
1. Add a public key of the instance to `infrastructure/secrets/secrets.nix`. You can get the public keys by running `ssh-keyscan <instance-ip-address>`. Follow the instructions above on giving a new user access to the secrets. In this case, the new user is the instance.
1. Add the instance hostname to the desired host under `deploy.nodes` in `infrastructure/flake.nix`.
1. In `infrastructure/`, run `nix develop` followed by `deploy .#catcolab-next`. The systemd `automerge` and `backend` services will fail at the end of the deployment, because the CatColab repo is missing. We will restart the services later after cloning the repo.
1. Access the instance in a new terminal:
  - Log in via `ssh root@<instance-ip-address>`. Do **not** log in as `catcolab`. If you don't have access, ask Evan.
  - On the instance, run `init-catcolab <branch-name>`. If the CatColab github repo branch name is omitted, it will clone the `main` branch. This script installs the nodejs dependencies, initializes the postgres database, runs the database migrations, and builds the required binaries.
1. The automerge and backend services should run now.

In case you are curious, the `catcolab-init` script performs the following tasks. See `infrastructure/hosts/*/backend.nix` for more information.

1. Clone the CatColab repo at `/var/lib/catcolab/`.
1. Symlink the secrets to the right locations in the cloned repo.
1. Install the Node.js dependencies.
1. Install Rust and Cargo.
1. Install Rust-based `sqlx-cli` for migrations.
1. Set up the Postgres user, database and permissions.
1. Stop any automerge or backend service that is running.
1. Run the database migrations.
1. Build the binaries for the automerge and backend services.
1. Start the automerge and backend service daemons.


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
