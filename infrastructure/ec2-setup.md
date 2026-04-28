# Setting Up CatColab on a New EC2 Instance

This guide covers launching a NixOS EC2 instance, deploying CatColab, and restoring a database backup.

## 1 Find the NixOS AMI

Go to <https://nixos.github.io/amis/> and filter by:
- Architecture: `x86_64`
- Region: `us-east-2`

Copy the **Name** from the most recent row (e.g. `nixos/25.11.8107.1073dad219cb-x86_64-linux`).

## 2. Configure and Launch the Instance

In the AWS EC2 console, click "Launch instances" (likely in the top right hand corner). This should take
you to the "Launch an instance" wizard.

### 2.1 "Name and tags"

Give it a relevant name, ideally in lower kebab-case or matching the domain name of the instance.

### 2.2 "Application and OS Images"

Into the search input with the placeholder text "Search our full catalog", paste the NixOS name, and
search. This will take you to a new AMI selection wizard, select the singular result from the "Community
AMIs" tab.

### 2.3 "Instance type"

Select "t3.medium" from the dropdown.

### 2.4 "Key pair (login)"

Select an existing key pair from the dropdown, or click "Create a new key pair" to create a new one
(type: ED25519). Creating a new pair will download a `.pem` file with your private key.

### 2.5 "Network settings"

Select "Create security group" and check:
- Allow HTTPS traffic from the internet
- Allow HTTP traffic from the internet

### 2.6 "Configure storage"

Set the root volume to 30 GiB.

### 2.7 Launch

Scroll to the bottom and click "Launch instance". This should take you to the "Instances" page where the new instance should be listed.

## 3 Assign an Elastic IP

When creating new persistent images, they should be configured to use an Elastic IP, this allows us to
re-use the IP if we ever need to re-create the instance, simplifying DNS configuration.

- Go to "Elastic IPs" in the in the "Network & Security" section of the left hand menu popover.
- Select an available IP (or allocate a new one), then from the "Actions" dropdown choose "Associate
  Elastic IP address" and select the new instance.

If creating a new Elastic IP, update the DNS records.

## 4 SSH into the Instance

```sh
mv ~/Downloads/<your-key>.pem ~/.ssh/<your-key>.pem
chmod 400 ~/.ssh/<your-key>.pem
ssh -i ~/.ssh/<your-key>.pem root@<elastic-ip>
```

If you've connected to an old host at the same domain/IP you will get a scary warning:

```
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
```

This informs you that the host has changed since that last time you connected to it, which is intentional
in this case. You can fix this warning by running:

```sh
ssh-keygen -R <elastic-ip/domain name> 
```

## 5 Register the Host Key

On the instance, get the host public key:

```sh
cat /etc/ssh/ssh_host_ed25519_key.pub
```

Back in the repo, update the corresponding `hostKey` entry in `infrastructure/ssh-keys.nix` with this value.

## 6 Re-encrypt Secrets

The host key is used for secret decryption via agenix. After updating it, re-encrypt all secrets:

```sh
cd infrastructure/secrets
agenix -r
```

Commit and push the re-encrypted secrets.

NOTE: the `agenix` command requires that the nix dev shell is active.

## 7 Deploy

```sh
deploy -s .#catcolab-next --ssh-opts="-i ~/.ssh/<your-key>.pem"
```

Replace `catcolab-next` with the appropriate deploy target.

## 8 Restore Database from Backup

SSH into the instance and pull the backup using rclone:

```sh
rclone --config=/run/agenix/rcloneConf copy backup:<target>/db_<date>.sql /tmp/
```

Restore it into PostgreSQL:

```sh
psql -f /tmp/db_<date>.sql
```

Replace `<target>` with the backup bucket name (e.g. `catcolab-next`) and `<date>` with the backup timestamp.

