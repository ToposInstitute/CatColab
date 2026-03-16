---
title: "Fixing hash mismatches in Nix"
---

The secrets used in deployment are encrpyted and included in the repository in the
`infrastructure/secrets/*.age` files. We use [agenix](https://github.com/ryantm/agenix) for encrypting
and decrpyting the secrets using ssh private and public keys respectively.

The `agenix` command is used for interacting with the encrypted secrets. It is avaialable
only through the nix development shell. The configuration for the command is defined in
`infrastructure/secrets/secrets.nix`. All example commands here will assume to be run from the
`infrastructure/secrets` folder.

The `agenix` configuration lists which users
(recipients, in the terms used by age/agenix) can decrypt which secrets files. Multiple recipients can be configured to decrypt files.


All ssh keys that can decrypt secrets files or ssh into remotes are defined in
`infrastructure/ssh-keys.nix`, where we define which users have access to which hosts. a Users with
access to hosts will be able ssh into that host as the `catcolab` user and decrpt, modify, and encrypt
the secrets files. The ssh keys defined in ssh-key.nix are used in secrets.nix for the secrets for the relevant hosts.

The contents of an encrypted secrets file can be decrypted likes this:

```
agenix -d rclone.conf.next.age
```

agenix will default to using the private key at "~/.ssh/id_ed25519", a different private key can be specified with the `-i` flag like this:

```
agenix -i ~/.ssh/id_ed25519 -d rclone.conf.next.age
```

The `-r` will re-encrpt all secrets files listed in secrets.nix with the recipients defined for those secrets
in the that file. This is useful when adding or removing recipients.

```
agenix -r
```

During the deployment process agenix will need to decrpyt the secerts to make them accessible to those things that need the secrets. This is done with the host ssh
key. The ssh key for a host is generated when the host is first created. After deployment the decrypted secrets are located at `/run/agenix`


---
title: "Secrets Management"
---

# Secrets Management

We use [agenix](https://github.com/ryantm/agenix) to manage encrypted secrets for deployment. Secrets are
encrypted with SSH public keys and stored in `infrastructure/secrets/*.age` files.

## Prerequisites

The `agenix` command is only available through the nix development shell. All commands below should be
run from the `infrastructure/secrets` directory.

## Configuration

### SSH Keys (`infrastructure/ssh-keys.nix`)
Defines which users have access to which hosts. Users with host access can SSH into that host as the `catcolab` user and manage secrets.

### Secrets Configuration (`infrastructure/secrets/secrets.nix`)
Defines which users (recipients) can decrypt which secret files. Multiple recipients can be configured per secret.

## Common Operations

### Viewing a Secret
To decrypt and view the contents of an encrypted secret:
```bash
agenix -d rclone.conf.next.age
```

By default, agenix uses the private key at `~/.ssh/id_ed25519`. To specify a different key:
```bash
agenix -i ~/.ssh/other_key -d rclone.conf.next.age
```

### Editing a Secret
To edit an encrypted secret file:
```bash
agenix -e rclone.conf.next.age
```

This decrypts the file, opens it in your `$EDITOR`, then re-encrypts it when you save and exit.

### Creating a New Secret
To create a new encrypted secret, first add it to `secrets.nix` with the appropriate recipients, then:
```bash
agenix -e newsecret.age
```

### Re-encrypting All Secrets
When adding or removing recipients from `secrets.nix`, re-encrypt all secrets:
```bash
agenix -r
```
This is needed when adding or removing recipients.

## Deployment

During deployment, agenix decrypts secrets using the host's SSH key (generated when the host is first
created). Decrypted secrets are available at `/run/agenix` on the deployed host.
