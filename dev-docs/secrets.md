---
title: "Backend Host access and Secret Management"
---

Staging backend access:

```
ssh catcolab@backend-next.catcolab.org
```

production backend access:

```
ssh catcolab@backend.catcolab.org
```


### Background

Access to the backend hosts and secrets are managed through ssh keys.

We are using [agenix](https://github.com/ryantm/agenix) to manage the secrets for our deployments. Age
allows us to encrypt secrets for mulitple recipients (public ssh keys), and agenix allows us to manage
the secrets safely and declaratively in the nix configuration.

The encrypted secrets are included in the repository, with the secrets for the hosts being organized as
follows in the `infrastructure/secrets` folder:

- production `backend.catcolab.org`:
  * `env.prod.age`
  * `rclone.conf.prod.age`
- staging `backend-next.catcolab.org`:
  * `env.next.age`
  * `rclone.conf.next.age`

All public SSH keys and their relation to are defined in `infrastructure/ssh-keys.nix`, 

The recipients for the secrets are defined in `infrastructure/secrets/secrets.nix` which uses
`infrastructure/ssh-keys.nix` to access the lists of recipients that are allowed to read the secrets for the different deployments.

### Granting a new user host access

Host access controls who can SSH into the EC2 hosts. To grant access:

1. Add the user's public key and key name to `infrastructure/ssh-keys.nix` under `allUserKeys`.
2. Add the user's key name to the `userKeys` list for each host the user should access in the
   `hosts` section of the same file.
4. Open a PR with changes to `ssh-keys.nix`.

The changes need to be deployed before the new user can log in. Staging is deployed after the a PR is merged into main, and production is deployed when a release is created.



### Granting a new user secrets access

Secrets access controls who can decrypt the `.age` files — both locally (to view or edit them)
and conceptually as a recipient of the encrypted data. To grant access:

1. Add the user's public key to `infrastructure/ssh-keys.nix` if it is not already there
   (this may have been done in the host access step above).
2. Ensure the new key name appears in the appropriate host's `userKeys` list, since `secrets.nix`
   uses the `allKeys` lists (which combine `userKeys` and the `hostKey`) to determine recipients.
3. Have someone with existing secrets access re-encrypt all secrets so that the new recipient is
   included. From the `infrastructure/` directory:
   ```
   nix develop
   ```
   Then from the `infrastructure/secrets/` directory:
   ```
   agenix -r
   ```
   The `-r` flag **re-encrypts** every `.age` file for the current set of recipients defined in
   `secrets.nix`. This is the step that actually gives the new user the ability to decrypt.
4. Commit and push the changes (the `.age` files will have new contents after re-encryption).


### Editing a secret

To view or edit the contents of an encrypted secret, use `agenix -e` from the
`infrastructure/secrets/` directory. For example, to edit the staging environment variables:

```
cd infrastructure/secrets
nix develop ..
EDITOR=vim agenix -e env.next.age
```

Replace `vim` with your preferred editor. The file will be decrypted into a temporary location,
opened in your editor, and re-encrypted when you save and close. You must be a listed recipient
of the file for this to work.


### Adding a new secret file

If you need to add an entirely new secret (not just edit an existing one):

1. Add an entry to `infrastructure/secrets/secrets.nix` with the filename and the list of
   recipients (typically referencing a host's `allKeys` from `ssh-keys.nix`).
2. Create the encrypted file:
   ```
   cd infrastructure/secrets
   nix develop ..
   agenix -e new-secret.age
   ```
   This will open your editor with an empty file. Add the secret content, save, and close.
3. Reference the new secret in the appropriate host configuration under
   `infrastructure/hosts/*/default.nix`, declaring where it should be decrypted on the host.
4. Deploy the updated configuration to the host.
5. Commit and push all changes.


All public SSH keys are defined in `infrastructure/ssh-keys.nix`. There are three kinds of keys
in this file:

- **User keys** (`allUserKeys`) — keys belonging to individual developers. These grant SSH access
  to the hosts and the ability to decrypt secret files locally.
- **Host keys** — the SSH host key of each EC2 instance (from `/etc/ssh/ssh_host_ed25519_key.pub`
  on the host). These are added as recipients so that agenix can decrypt the secret files on the
  host at deploy time. You get a host's public key by running `ssh-keyscan <host-address>` after
  the instance is first provisioned.
- **CI deploy keys** — keys used by GitHub Actions to deploy to the hosts. The private half of
  these keys is stored as a GitHub Actions secret (e.g. `CATCOLAB_NEXT_DEPLOYUSER_KEY`). CI uses
  these to SSH into the host and run `deploy-rs`. There are currently two:
  * `catcolab-next-deployuser` — used by the `deploy_backend` workflow to deploy staging
    (`catcolab-next`) on every merge to main.
  * `catcolab-private-actions-user` — used by a private repo (`ToposInstitute/catcolab-private-actions`)
    to deploy production (`catcolab`) on release.

Each host in `ssh-keys.nix` has a `userKeys` list (the user and CI keys that should have access)
and an `allKeys` list (the `userKeys` plus the host key). The `allKeys` list is what `secrets.nix`
uses to determine who can decrypt each secret file.
