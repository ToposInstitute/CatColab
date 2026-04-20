let
  keys = import ../ssh-keys.nix;
in
{
  "env.next.age" = {
    publicKeys = keys.hosts.catcolab-next.allKeys;
  };
  "rclone.conf.next.age" = {
    publicKeys = keys.hosts.catcolab-next.allKeys;
  };
  "env.prod.age" = {
    publicKeys = keys.hosts.catcolab.allKeys;
  };
  "rclone.conf.prod.age" = {
    publicKeys = keys.hosts.catcolab.allKeys;
  };
}
