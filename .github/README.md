# GitHub rulesets

`merge_queue_ruleset.json` defines the merge queue and required checks for `main`.
It is applied manually with `gh`, using an account with repository administration
permission. Run these commands from the repository root.

## Initial setup

Merge the queue-enabled workflows into `main` before activating the ruleset:

```sh
gh api --method POST repos/ToposInstitute/CatColab/rulesets \
  --input .github/merge_queue_ruleset.json
```

## Updating

1. Edit `merge_queue_ruleset.json` and merge the change through a PR. If adding or
   renaming required checks, ensure the corresponding workflows are already on
   `main` and report on both `pull_request` and `merge_group` events.
2. Find the existing ruleset ID:

    ```sh
    gh api repos/ToposInstitute/CatColab/rulesets \
      --jq '.[] | {id, name}'
    ```

3. Update that ruleset (replace `RULESET_ID` with the ID for `Main merge queue`):

    ```sh
    gh api --method PUT repos/ToposInstitute/CatColab/rulesets/RULESET_ID \
      --input .github/merge_queue_ruleset.json
    ```

4. Inspect the applied configuration:

    ```sh
    gh api repos/ToposInstitute/CatColab/rulesets/RULESET_ID
    ```
