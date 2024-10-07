
let
  catcolab = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMOMBnXy4XMcogVMXdXt9NQCyAy8FaBj53groT4TTKBA root@ip-172-31-25-34.us-east-2.compute.internal";
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
  shaowei = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOV/7Vnjn7PwOC9VWyRAvsh5lUieIBHgdf4RRLkL8ZPa shaowei@gmail.com";
in
builtins.mapAttrs (_: publicKeys: {inherit publicKeys;})
  ({
      "DATABASE_URL.age" = [ catcolab owen epatters shaowei ];
      "instrument.mjs.age" = [ catcolab owen epatters shaowei ];
  })
