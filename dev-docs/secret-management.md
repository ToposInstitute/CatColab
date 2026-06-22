---
title: "Backend Host access and Secret Management"
---

### Quick reference

| Host | Command |
| :--- | :------ |
| Staging | `ssh catcolab@backend-next.catcolab.org` |
| Production | `ssh catcolab@backend.catcolab.org` |


### Background

Access to the backend hosts and secret files are managed through ssh keys.

We are using [agenix](https://github.com/ryantm/agenix) to manage the secret files for our deployments.
Age allows us to encrypt a file for multiple recipients (public ssh keys), and agenix allows us to manage
the secret files safely and declaratively in the nix configuration.

The encrypted secret files are included in the repository, organized as follows in the
`infrastructure/secrets` folder:

- production `backend.catcolab.org`:
  * `env.prod.age`
  * `rclone.conf.prod.age`
- staging `backend-next.catcolab.org`:
  * `env.next.age`
  * `rclone.conf.next.age`


### Granting a new user access

Adding a user's SSH key to `ssh-keys.nix` grants them both SSH access and secret file access.

1. Add the user's public key and key name to `infrastructure/ssh-keys.nix` under `allUserKeys`.
2. Add the user's key name to the `userKeys` list for each host the user should access in the
   `hosts` section of the same file.
3. Have someone with existing access re-encrypt all secret files so that the new recipient is
   included. From the `infrastructure/` directory:
   ```
   nix develop
   ```
   Then from the `infrastructure/secrets/` directory:
   ```
   agenix -r
   ```
   The `-r` flag re-encrypts every `.age` file for the current set of recipients defined in
   `secrets.nix`. This gives the new user the ability to decrypt and re-encrypt the secret files.
4. Open a PR with the changes to `ssh-keys.nix` and the re-encrypted `.age` files.

Host access takes effect after the changes are deployed. Staging is deployed when a PR is merged
into main, and production is deployed when a release is created. Secret file access takes effect
immediately after step 3.


### Viewing a secret file

To decrypt a secret file and print its contents to stdout, use `agenix -d` from the
`infrastructure/secrets/` directory. For example:

```
cd infrastructure/secrets
nix develop
agenix -d env.next.age
```

You must be a listed recipient of the file for this to work.


### Editing a secret file

To edit the contents of an encrypted secret file, use `agenix -e` from the `infrastructure/secrets/`
directory. For example:

```
cd infrastructure/secrets
nix develop
EDITOR=vim agenix -e env.next.age
```

Replace `vim` with your preferred editor. The file will be decrypted into a temporary location, opened
in your editor, and re-encrypted when you save and close. You must be a listed recipient of the file for
this to work.


### Adding a new secret file

If you need to add a new secret file:

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

