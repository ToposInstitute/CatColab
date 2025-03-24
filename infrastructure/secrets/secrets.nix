let
  catcolab-jmoggr3 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPhQmynv8T1qQs2IcTb9F0YvRl3Gyg6mTC0N9R8wMcoM root@ip-172-31-20-80.ec2.internal";
  catcolab-jmoggr = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH9P3t2Y6k5Jrwbd2XRyV0ok0BHmyHFfL+E62Qu/pVm+ root@ip-172-31-80-32.ec2.internal";
  catcolab = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPyxORhhfO+9F2hQZ3I/EiSpfg+caWpG6c8AuG5u1XtK root@ip-172-31-14-38.us-east-2.compute.internal";
  catcolab-next = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBZaycYjvaZ5XhxVIvFr8zXvcy1GrViCKLIZCalZuk1l root@ip-172-31-9-45.us-east-2.compute.internal";
  owen = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2sBTuqGoEXRWpBRqTBwZZPDdLGGJ0GQcuX5dfIZKb4 o@red-special";
  epatters = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAKXx6wMJSeYKCHNmbyR803RQ72uto9uYsHhAPPWNl2D evan@epatters.org";
  jmoggr = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMiaHaeJ5PQL0mka/lY1yGXIs/bDK85uY1O3mLySnwHd j@jmoggr.com";
  catcolab-next-deployuser = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM7AYg1fZM0zMxb/BuZTSwK4O3ycUIHruApr1tKoO8nJ deployuser@next.catcolab.org";
  catcolab-jmoggr-deployuser = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOXGvHcfDo2aHyLqaMH+POGhySJ4pOmCiL7RRGxboPuK jmoggrDeployuser";
in
builtins.mapAttrs (_: publicKeys: { inherit publicKeys; }) ({
  ".env.next.age" = [
    catcolab-next
    owen
    epatters
    jmoggr
    catcolab-next-deployuser
    catcolab-jmoggr
    catcolab-jmoggr3
    catcolab-jmoggr-deployuser
  ];
  ".env.prod.age" = [
    catcolab
    owen
    epatters
  ];
  "rclone.conf.age" = [
    catcolab
    owen
    epatters
  ];
})
