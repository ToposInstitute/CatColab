sudo -E nixos-rebuild switch --flake .#catcolab-next --option url-substituter-git "git@github.com:"


[catcolab@catcolab-next:~/catcolab]$ sudo -E nixos-rebuild switch --flake .#catcolab-next --option url-substituter-git "git@github.com:"
warning: $HOME ('/home/catcolab') is not owned by you, falling back to the one defined in the 'passwd' file ('/root')
warning: unknown setting 'url-substituter-git'
building the system configuration...
warning: $HOME ('/home/catcolab') is not owned by you, falling back to the one defined in the 'passwd' file ('/root')
warning: unknown setting 'url-substituter-git'
evaluation warning: 'system' has been renamed to/replaced by 'stdenv.hostPlatform.system'
The authenticity of host 'github.com (140.82.112.4)' can't be established.
ED25519 key fingerprint is SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU.
This key is not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
Warning: Permanently added 'github.com' (ED25519) to the list of known hosts.
warning: $HOME ('/home/catcolab') is not owned by you, falling back to the one defined in the 'passwd' file ('/root')
updating GRUB 2 menu...
stopping the following units: amazon-ssm-agent.service, apply-ec2-data.service, audit.service, automerge.service, backend.service, caddy.service, growpart.service, kmod-static-nodes.service, logrotate-checkconf.service, mount-pstore.service, network-setup.service, nscd.service, postgresql.service, print-host-key.service, resolvconf.service, serial-getty@ttyS0.service, systemd-growfs-root.service, systemd-modules-load.service, systemd-oomd.service, systemd-oomd.socket, systemd-sysctl.service, systemd-timesyncd.service, systemd-tmpfiles-resetup.service, systemd-udev-trigger.service, systemd-vconsole-setup.service
NOT restarting the following changed units: amazon-init.service, systemd-journal-flush.service, systemd-logind.service, systemd-random-seed.service, systemd-remount-fs.service, systemd-tmpfiles-setup.service, systemd-update-utmp.service, systemd-user-sessions.service, user-runtime-dir@1001.service, user@1001.service
activating the configuration...
[agenix] creating new generation in /run/agenix.d/168
[agenix] decrypting secrets...
decrypting '/nix/store/kzq69h94jhmnm5kam46swf85agp4qa8z-env.next.age' to '/run/agenix.d/168/catcolabSecrets'...
decrypting '/nix/store/rdl9k0sgc0djw9hhq92sahjw4m0vmirw-rclone.conf.next.age' to '/run/agenix.d/168/rcloneConf'...
[agenix] symlinking new secrets to /run/agenix (generation 168)...
[agenix] removing old secrets (generation 167)...
[agenix] chowning...
Running backupdb script...
PostgreSQL is not running. Skipping backup.
restarting systemd...
reloading user units for catcolab...
restarting sysinit-reactivation.target
reloading the following units: dbus.service, firewall.service, reload-systemd-vconsole-setup.service
restarting the following units: dhcpcd.service, nix-daemon.service, sshd.service, systemd-journald.service, systemd-udevd.service
starting the following units: amazon-ssm-agent.service, apply-ec2-data.service, backend.service, caddy.service, growpart.service, kmod-static-nodes.service, logrotate-checkconf.service, network-setup.service, nscd.service, postgresql.service, print-host-key.service, resolvconf.service, serial-getty@ttyS0.service, systemd-growfs-root.service, systemd-modules-load.service, systemd-oomd.socket, systemd-sysctl.service, systemd-timesyncd.service, systemd-tmpfiles-resetup.service, systemd-udev-trigger.service, systemd-vconsole-setup.service
Done. The new configuration is /nix/store/0v6pg16gvap2y5mzmla7c33sksaq4ixa-nixos-system-catcolab-next-25.11.20260103.30a3c51


[catcolab@catcolab-next:~/catcolab]$ ls -l /run/current-system
lrwxrwxrwx 1 root root 93 Jan 20 10:28 /run/current-system -> /nix/store/rfjhck3axmf8n9bb361gb7cja3kd1wf1-nixos-system-catcolab-next-25.05.20250721.92c2e04



ls -l /run/current-system
nix eval --raw .#nixosConfigurations.catcolab-next.config.system.build.toplevel

did match
- 7244d1bed42dfc0ab7c6c5daffc9c2907080772b
- 27c41e58b856666767dce523e1d19e7764895197

did not match



7244d1bed42dfc0ab7c6c5daffc9c2907080772b
vcpx1nkyqjlf42pjxdjhkxrwrn7b63g4



copying staging db to local




ssh catcolab@backend-next.catcolab.org "pg_dump --clean" > dump.sql
psql "$DATABASE_URL" < dump.sql


<!-- Error: Failed to retrieve document: Request with invalid data: Document not found -->
http://localhost:5173/model/019b280f-d48c-7f70-9c58-44055af078ce

ssh catcolab@backend-next.catcolab.org "pg_dump --clean" | psql "$DATABASE_URL"

If you are using the Nix development shell, `DATABASE_URL` will already be set from `packages/backend/.env`, otherwise you will need to set it: 


restoring from backup



Failed at change 2/12 document_verification.ts:35:21
Diff (JSON patches): [
  {
    "op": "replace",
    "path": "/type",
    "value": "paragraph"
  },
  {
    "op": "add",
    "path": "/attrs",
    "value": {}
  },
  {
    "op": "add",
    "path": "/isEmbed",
    "value": false
  },
  {
    "op": "add",
    "path": "/parents",
    "value": []
  }
]


http://localhost:5173/model/019b9d60-1cdb-7d00-a184-820f9ad45136
Failed at change 5/38 document_verification.ts:35:21
Diff without round trip: []
Diff with round trip: [
  {
    "op": "replace",
    "path": "/type",
    "value": "paragraph"
  },
  {
    "op": "replace",
    "path": "/notebook/cellContents/019b6ce3-ff0b-776a-8fec-f9a619b31a27/content",
    "value": "￼Taken from Figure 1 of [Eberhard O. Voit, Systems Biology: A Very Short Introduction, Oxford University Press 2020, ISBN: 978-0-19-882837-2].￼The glycolosis pathway describes the way in which the bacterium Lactococcus lactis breaks glucose down into lactate."
  },
  {
    "op": "add",
    "path": "/attrs",
    "value": {}
  },
  {
    "op": "add",
    "path": "/isEmbed",
    "value": false
  },
  {
    "op": "add",
    "path": "/parents",
    "value": []
  }
]


└─ npm run test

> frontend@0.1.0 test
> vitest --mode=development


 DEV  v4.0.8 /repos/catcolab/packages/frontend

 ✓ src/api/document_rpc.test.ts (13 tests) 526ms
     ✓ should reject documents exceeding 5MB size limit  306ms
 ❯ src/stdlib/theories.test.ts (6 tests | 2 failed) 217ms
     ✓ should have a nonempty list of theories 1ms
     ✓ should have an extant default theory 0ms
     ✓ should have dynamically loadable theories 212ms
     ✓ should have valid references to migratable theories 0ms
     × types bound for models should exist in theory 2ms
     × types bound for instances should exist in theory 0ms
 ✓ src/model/model_library.test.ts (9 tests) 44ms
 ✓ src/api/user_rpc.test.ts (11 tests) 805ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/stdlib/theories.test.ts > Standard library of theories > types bound for models should exist in theory
TypeError: theory.theory.hasObType is not a function
 ❯ src/stdlib/theories.test.ts:39:42
     37|                     assert(theory.theory.hasMorType(meta.morType));
     38|                 } else {
     39|                     assert(theory.theory.hasObType(meta.obType));
       |                                          ^
     40|                 }
     41|             }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/stdlib/theories.test.ts > Standard library of theories > types bound for instances should exist in theory
TypeError: theory.theory.hasObType is not a function
 ❯ src/stdlib/theories.test.ts:52:42
     50|                     assert(theory.theory.hasMorType(meta.morType));
     51|                 } else {
     52|                     assert(theory.theory.hasObType(meta.obType));
       |                                          ^
     53|                 }
     54|             }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed | 3 passed (4)
      Tests  2 failed | 37 passed (39)
   Start at  10:32:06
   Duration  3.01s (transform 2.54s, setup 0ms, collect 7.30s, tests 1.59s, environment 0ms, prepare 17ms)

 FAIL  Tests failed. Watching for file changes...
       press h to show help, press q to quit
