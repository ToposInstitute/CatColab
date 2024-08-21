After thoroughly considering our options, we have decided to use no ORMs and to
roll our own migration library. Our migration library is probably bad, but 
at least it is very easy to understand. 
It creates a table called "migrations" in the database, if such a
table doesn't already exist. It then runs, in alphabetical order, every
migration in `migrations/` that doesn't end in `.undo.sql` and that doesn't
exist in the migrations table; when migrations are run successfully they are
added to the table. The user is encouraged to prefix their migrations with
numbers to ensure that they are run in the expected order. To "teardown" the
database, all migrations that end in `.undo.sql` whose corresponding `.sql`
migration *exist* in the migrations table are run in reverse alphabetical order.

Also, we are using nodejs's own test framework rather than a third-party
framework.

## Basic usage

Install postgresql, and set the environment variable `DATABASE_URL` to an
appropriate connection string for connecting to your postgresql instance.

Then you can run `npm run migrate` to set up the database and `npm run teardown`
to destroy it. `npm run test` will teardown and then set up the database
(to get it to a clean state) and then run tests. It uses `TEST_DATABASE_URL`
rather than `DATABASE_URL`.
