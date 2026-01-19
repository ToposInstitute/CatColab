# Using Annotations and Refs

This guide explains how to use `@inkandswitch/refs` and `@inkandswitch/annotations` together to build applications that attach metadata to locations in Automerge documents.

## Overview

**Refs** are stable references to locations within an Automerge document. They point to properties, array elements, or text ranges, and can track those locations as the document changes.

**Annotations** are typed metadata you can attach to refs. Think comments on a text selection, highlights on paragraphs, or status markers on todo items.

Together, they let you build collaborative features like commenting, highlighting, presence indicators, and more.

## Installation

Core packages:

```bash
npm install @inkandswitch/refs @inkandswitch/annotations
```

Built-in annotation types (install what you need):

```bash
npm install @inkandswitch/annotations-context     # Shared annotation context
npm install @inkandswitch/annotations-comments    # Comment threads
npm install @inkandswitch/annotations-diff        # Change tracking
npm install @inkandswitch/annotations-selection   # Selection state
```

## Part 1: Working with Refs

### Creating Refs

Use the `ref()` function to create a reference to a location in a document:

```ts
import { ref } from "@inkandswitch/refs";
import { Repo } from "@automerge/automerge-repo";

const repo = new Repo();
const handle = repo.create();

handle.change((d) => {
  d.title = "My Document";
  d.todos = [
    { id: "1", title: "Buy milk", done: false },
    { id: "2", title: "Write code", done: true },
  ];
  d.content = "Hello world, this is some text.";
});

// Ref to a property
const titleRef = ref(handle, "title");

// Ref to an array element by index
const firstTodoRef = ref(handle, "todos", 0);

// Ref to a nested property
const firstTodoTitleRef = ref(handle, "todos", 0, "title");

// Ref to an array element by pattern matching
const todoByIdRef = ref(handle, "todos", { id: "2" });
```

### Reading Values

Call `.value()` to get the current value:

```ts
titleRef.value(); // "My Document"
firstTodoRef.value(); // { id: "1", title: "Buy milk", done: false }
firstTodoTitleRef.value(); // "Buy milk"
todoByIdRef.value(); // { id: "2", title: "Write code", done: true }
```

Returns `undefined` if the path can't be resolved.

### Changing Values

Use `.change()` to modify the value a ref points to:

```ts
// For primitives, pass a function or direct value
titleRef.change("New Title");
titleRef.change((title) => title.toUpperCase());

// For objects/arrays, mutate in place
firstTodoRef.change((todo) => {
  todo.done = true;
});

// For strings, you get a MutableText object with splice/updateText
const contentRef = ref(handle, "content");
contentRef.change((text) => {
  text.splice(0, 5, "Hi"); // Replace "Hello" with "Hi"
  // or
  text.updateText("Entirely new content");
});
```

### Removing Values

Call `.remove()` to delete the value from its parent:

```ts
// Remove a property from an object
const ageRef = ref(handle, "user", "age");
ageRef.remove(); // deletes handle.doc().user.age

// Remove an item from an array
const todoRef = ref(handle, "todos", 0);
todoRef.remove(); // removes first todo

// Remove text within a range
const rangeRef = ref(handle, "content", cursor(0, 5));
rangeRef.remove(); // deletes first 5 characters
```

### Text Ranges with Cursors

Use `cursor()` to create refs to text ranges. Cursors track positions through edits:

```ts
import { ref, cursor } from "@inkandswitch/refs";

handle.change((d) => {
  d.note = "Hello World";
});

// Create a ref to characters 0-5 ("Hello")
const rangeRef = ref(handle, "note", cursor(0, 5));
rangeRef.value(); // "Hello"

// The range tracks through edits
handle.change((d) => {
  splice(d, ["note"], 0, 0, ">>> "); // Insert at beginning
});

// Range still points to "Hello" (now at different position)
rangeRef.value(); // "Hello"
```

### Listening to Changes

Subscribe to changes that affect a ref's value:

```ts
const unsubscribe = titleRef.onChange((value, payload) => {
  console.log("Title changed to:", value);
  console.log("Patches:", payload.patches);
});

// Later, stop listening
unsubscribe();
```

The callback fires when:

- The value itself changes
- Any descendant of the value changes (for objects/arrays)
- The parent is replaced

It does NOT fire for sibling changes.

### Comparing Refs

```ts
// Check equality (same document, path, and heads)
ref1.equals(ref2);

// Check if one ref contains another (ancestor check)
const todoRef = ref(handle, "todos", 0);
const titleRef = ref(handle, "todos", 0, "title");
todoRef.contains(titleRef); // true
titleRef.contains(todoRef); // false

// Check if two text ranges overlap
const range1 = ref(handle, "text", cursor(0, 10));
const range2 = ref(handle, "text", cursor(5, 15));
range1.overlaps(range2); // true
```

### Ref URLs and Serialization

Every ref has a URL that uniquely identifies it:

```ts
const titleRef = ref(handle, "title");
console.log(titleRef.url);
// "automerge:documentId/title"

const todoRef = ref(handle, "todos", 0, "title");
console.log(todoRef.url);
// "automerge:documentId/todos/@0/title"
```

Parse refs from URLs:

```ts
import { fromUrl, findRef } from "@inkandswitch/refs";

// If you have the handle
const ref = fromUrl(handle, url);

// If you need to look up the handle
const ref = await findRef(repo, url);
```

### Time Travel with viewAt

Create a ref viewing the document at a specific point in history:

```ts
import * as Automerge from "@automerge/automerge";

// Capture current heads
const heads = Automerge.getHeads(handle.doc());

// Make changes
handle.change((d) => {
  d.value = 2;
});

// View at previous state
const currentRef = ref(handle, "value");
const pastRef = currentRef.viewAt(heads);

currentRef.value(); // 2
pastRef.value(); // 1

// Time-travel refs are read-only
pastRef.change(() => 3); // throws Error
```

### Ref Caching

The `ref()` function caches instances—calling it with the same arguments returns the same object:

```ts
const ref1 = ref(handle, "todos", 0);
const ref2 = ref(handle, "todos", 0);
ref1 === ref2; // true
```

---

## Part 2: Working with Annotations

### Using Annotation Types

Before defining your own annotation types, check if a built-in type already exists (see Part 3). The ecosystem provides types for common use cases like comments, diffs, and selection.

If you need a custom type, define it with `defineAnnotationType`:

```ts
import { defineAnnotationType } from "@inkandswitch/annotations";

// Simple value type
const Priority = defineAnnotationType<"low" | "medium" | "high">(
  "myapp/priority"
);

// Complex value type
const Bookmark = defineAnnotationType<{
  label: string;
  color: string;
}>("myapp/bookmark");

// Boolean marker
const Pinned = defineAnnotationType<boolean>("myapp/pinned");
```

Use unique, namespaced IDs (like `"myapp/priority"`) to avoid conflicts between tools. Types are identified by their string ID, so two tools bundling the same type definition will still interoperate.

### Creating Annotation Sets

An `AnnotationSet` stores annotations and provides querying:

```ts
import { AnnotationSet } from "@inkandswitch/annotations";

const annotations = new AnnotationSet();
```

### Adding Annotations

Attach annotations to refs:

```ts
// Add a single annotation
const titleRef = ref(handle, "title");
annotations.add(titleRef, Comment("This title is great!"));

// Add multiple annotations to the same ref
annotations.add(titleRef, [
  Comment("First comment"),
  Highlight({ color: "yellow", author: "alice" }),
]);

// Compose annotation sets (live updates flow through)
const myAnnotations = new AnnotationSet();
const theirAnnotations = new AnnotationSet();
annotations.add(myAnnotations);
annotations.add(theirAnnotations);
```

When you add an annotation set as a child, the parent receives live updates as the child changes.

### Querying Annotations

#### By Type

```ts
// Get all annotations of a type
const comments = annotations.ofType(Comment);

for (const [ref, annotation] of comments) {
  console.log(ref.url, annotation.value);
}

// Lookup specific ref in type view
const comment = comments.lookup(titleRef); // string | undefined
const allComments = comments.lookupAll(titleRef); // string[]
```

#### By Ref

```ts
// Get all annotations on a specific ref
const titleAnnotations = annotations.onRef(titleRef);

for (const [ref, annotation] of titleAnnotations) {
  console.log(annotation.type.id, annotation.value);
}

// Lookup by type within ref view
const comment = titleAnnotations.lookup(Comment);
const highlight = titleAnnotations.lookup(Highlight);
```

#### By Relationship

```ts
// Get annotations on direct children of an array or text ref
const todosRef = ref(handle, "todos");
const childAnnotations = annotations.onChildrenOf(todosRef);

// Get annotations anywhere in a subtree
const subtreeAnnotations = annotations.onPartOf(todosRef);
```

#### Direct Lookup

```ts
// Shortcut: lookup directly on the set
const comment = annotations.lookup(titleRef, Comment);
const allComments = annotations.lookupAll(titleRef, Comment);
```

### Removing Annotations

```ts
// Remove all annotations of a type
annotations.remove(Comment);

// Remove all annotations on a ref
annotations.remove(titleRef);

// Remove specific type from specific ref
annotations.remove(titleRef, Comment);

// Remove a child annotation set
annotations.remove(myAnnotations);

// Clear everything
annotations.clear();
```

### Reactivity

#### Subscribe to All Changes

```ts
const unsubscribe = annotations.subscribe(() => {
  console.log("Annotations changed");
});
```

#### Listen to Specific Events

```ts
annotations.on("change", (change) => {
  for (const [ref, annotation] of change.added) {
    console.log("Added:", annotation.value);
  }
  for (const [ref, annotation] of change.removed) {
    console.log("Removed:", annotation.value);
  }
});
```

#### Filtered Views Are Also Reactive

```ts
const comments = annotations.ofType(Comment);

comments.subscribe(() => {
  console.log("Comments specifically changed");
});

comments.on("change", (change) => {
  // Only fires for Comment type changes
});
```

### Batching Changes

Batch multiple operations into a single change event:

```ts
annotations.change(() => {
  annotations.remove(titleRef, Comment);
  annotations.add(titleRef, Comment("New comment"));
  annotations.add(itemRef, Highlight({ color: "blue", author: "bob" }));
});
// Single "change" event with all added/removed
```

---

## Part 3: Built-in Annotation Types

The patchwork ecosystem provides several ready-to-use annotation types. Use these instead of defining your own when possible—they're designed to work well with the annotation context and other tools.

### The Annotation Context

Before using built-in annotation types, understand the **annotation context**. This is a shared, global `AnnotationSet` that all tools can read from and contribute to:

```ts
import { annotations } from "@inkandswitch/annotations-context";

// The context is a constrained AnnotationSet
// You can query it like any annotation set
for (const [ref, annotation] of annotations) {
  console.log(ref.url, annotation.type.id);
}

// But you can only add/remove entire annotation sources, not individual annotations
const myToolAnnotations = new AnnotationSet();
annotations.add(myToolAnnotations); // Add your tool's annotation set
annotations.remove(myToolAnnotations); // Remove it when done
```

The pattern is: each tool maintains its own local `AnnotationSet`, then registers it with the shared context. This keeps tools decoupled while allowing them to see each other's annotations.

### Comments (`@inkandswitch/annotations-comments`)

The comments package provides a full commenting system with threads and replies:

```bash
npm install @inkandswitch/annotations-comments
```

```ts
import {
  CommentThread,
  createComment,
  createCommentThread,
  createReply,
  commentThreadsWithRefOfDoc,
} from "@inkandswitch/annotations-comments";
```

#### Creating Comments

```ts
import { ref, cursor } from "@inkandswitch/refs";

// Create a comment on a text selection
const selectionRef = ref(handle, "content", cursor(10, 25));

const commentRef = createComment({
  refs: [selectionRef],
  content: "This paragraph needs work",
  contactUrl: "automerge:user123", // Your user's contact document
});
```

#### Creating Threads with Multiple Anchors

A comment thread can be anchored to multiple refs:

```ts
const ref1 = ref(handle, "title");
const ref2 = ref(handle, "summary");

// Thread attached to both locations
const threadRef = createCommentThread([ref1, ref2]);
```

#### Replying to Threads

```ts
const replyRef = createReply({
  threadRef,
  content: "I agree, let's revise this",
  contactUrl: "automerge:user456",
});
```

#### Loading Comment Threads

Comments are stored in the document under `@comments`. Load them as annotation-ref pairs:

```ts
const threadsWithRefs = await commentThreadsWithRefOfDoc(handle, repo);

for (const [threadRef, thread] of threadsWithRefs) {
  console.log(`Thread ${thread.id} with ${thread.comments.length} comments`);

  // The thread's anchor refs
  for (const anchorRef of thread.refs) {
    console.log(`  Anchored to: ${anchorRef.url}`);
  }
}
```

#### The CommentThread Annotation Type

Use the `CommentThread` annotation type to mark refs with their associated thread:

```ts
import { AnnotationSet } from "@inkandswitch/annotations";
import { annotations } from "@inkandswitch/annotations-context";

// Build annotation set from stored threads
const commentAnnotations = new AnnotationSet();

for (const [threadRef, thread] of threadsWithRefs) {
  for (const anchorRef of thread.refs) {
    commentAnnotations.add(anchorRef, CommentThread(threadRef));
  }
}

// Register with global context so other tools can see comments
annotations.add(commentAnnotations);
```

### Diff (`@inkandswitch/annotations-diff`)

The diff package annotates refs with change information—useful for highlighting what changed between versions:

```bash
npm install @inkandswitch/annotations-diff
```

```ts
import { Diff, diffAnnotationsOfDoc } from "@inkandswitch/annotations-diff";
import { annotations } from "@inkandswitch/annotations-context";
import * as Automerge from "@automerge/automerge";
```

#### Computing Diff Annotations

```ts
// Capture a "before" state
const headsBefore = Automerge.getHeads(handle.doc());

// Make changes...
handle.change((d) => {
  d.title = "Updated Title";
  d.content = "New content here";
});

// Compute diff annotations
const diffAnnotations = diffAnnotationsOfDoc(handle, headsBefore);

// Register with context to make diffs visible to editors
annotations.add(diffAnnotations);
```

#### Querying Diff Annotations

```ts
// Find all changed refs
for (const [ref, annotation] of diffAnnotations.ofType(Diff)) {
  switch (annotation.value.type) {
    case "added":
      console.log(`Added: ${ref.url}`);
      break;
    case "changed":
      console.log(`Changed: ${ref.url}, was: ${annotation.value.before}`);
      break;
    case "deleted":
      console.log(`Deleted: ${ref.url}, was: ${annotation.value.before}`);
      break;
  }
}
```

#### Diff on Text Ranges

For text changes, diff annotations include cursor ranges pointing to the exact changed spans:

```ts
// After editing text, diff annotations point to inserted/deleted ranges
const textRef = ref(handle, "content");
const textDiffs = diffAnnotations.onChildrenOf(textRef);

for (const [rangeRef, annotation] of textDiffs.ofType(Diff)) {
  // rangeRef has a cursor range for the specific text span
  if (annotation.value.type === "deleted") {
    console.log(`Deleted text: "${annotation.value.before}"`);
  }
}
```

### Selection (`@inkandswitch/annotations-selection`)

The selection package tracks which refs are currently selected—useful for multi-select UIs and cross-tool coordination:

```bash
npm install @inkandswitch/annotations-selection
```

```ts
import {
  IsSelected,
  $selectedRefs,
  isSelected,
  $selectedDocUrls,
} from "@inkandswitch/annotations-selection";
import { annotations } from "@inkandswitch/annotations-context";
```

#### Marking Refs as Selected

```ts
const mySelections = new AnnotationSet();

// Select a ref
const todoRef = ref(handle, "todos", { id: "abc" });
mySelections.add(todoRef, IsSelected(true));

// Register with context
annotations.add(mySelections);
```

#### Reading Selection State

The package provides reactive signals for selection state:

```ts
// Get all currently selected refs (reactive)
$selectedRefs.subscribe((selectedRefs) => {
  console.log(`${selectedRefs.length} refs selected`);
});

// Check if a specific ref is selected (reactive)
const todoSelected = isSelected(todoRef);
todoSelected.subscribe((selected) => {
  console.log(`Todo is ${selected ? "selected" : "not selected"}`);
});

// Get unique document URLs of selected refs
$selectedDocUrls.subscribe((urls) => {
  console.log("Documents with selections:", urls);
});
```

#### Clearing Selection

```ts
// Remove all selections from your tool
mySelections.clear();

// Or remove selection from specific ref
mySelections.remove(todoRef, IsSelected);
```

---

## API Reference

### @inkandswitch/annotations-context

| Export        | Description                               |
| ------------- | ----------------------------------------- |
| `annotations` | Shared global AnnotationSet for all tools |

### @inkandswitch/annotations-comments

| Export                         | Description                         |
| ------------------------------ | ----------------------------------- |
| `CommentThread`                | Annotation type for comment threads |
| `createComment()`              | Create a comment with a new thread  |
| `createCommentThread()`        | Create an empty thread on refs      |
| `createReply()`                | Add a reply to an existing thread   |
| `commentThreadsWithRefOfDoc()` | Load all threads from a document    |

### @inkandswitch/annotations-diff

| Export                   | Description                               |
| ------------------------ | ----------------------------------------- |
| `Diff`                   | Annotation type for change markers        |
| `ViewHeads`              | Annotation type for time-travel state     |
| `diffAnnotationsOfDoc()` | Compute diff annotations between versions |

### @inkandswitch/annotations-selection

| Export                | Description                             |
| --------------------- | --------------------------------------- |
| `IsSelected`          | Annotation type for selection state     |
| `$selectedRefs`       | Reactive signal of all selected refs    |
| `isSelected(ref)`     | Reactive signal for a specific ref      |
| `$selectedDocUrls`    | Reactive signal of selected doc URLs    |
| `$selectedDocHandles` | Reactive signal of selected doc handles |

### @inkandswitch/refs

| Export                     | Description                            |
| -------------------------- | -------------------------------------- |
| `ref(handle, ...path)`     | Create a ref to a document location    |
| `cursor(start, end?)`      | Create a cursor marker for text ranges |
| `fromUrl(handle, url)`     | Parse a ref from a URL string          |
| `findRef(repo, url)`       | Find and return a ref by URL           |
| `fromString(handle, path)` | Create a ref from a path string        |

#### Ref Methods

| Method                | Description                     |
| --------------------- | ------------------------------- |
| `value()`             | Get the current value           |
| `change(fn \| value)` | Update the value                |
| `remove()`            | Remove from parent container    |
| `onChange(callback)`  | Subscribe to value changes      |
| `viewAt(heads)`       | Create time-travel view         |
| `equals(other)`       | Check equality                  |
| `contains(other)`     | Check if this contains other    |
| `isChildOf(parent)`   | Check if direct child of parent |
| `overlaps(other)`     | Check if ranges overlap         |

#### Ref Properties

| Property    | Description                        |
| ----------- | ---------------------------------- |
| `url`       | Serialized URL representation      |
| `docHandle` | The underlying DocHandle           |
| `path`      | Array of path segments             |
| `range`     | Cursor range (if text ref)         |
| `heads`     | Version heads (if time-travel ref) |

### @inkandswitch/annotations

| Export                        | Description                  |
| ----------------------------- | ---------------------------- |
| `defineAnnotationType<T>(id)` | Define a new annotation type |
| `AnnotationSet`               | Container for annotations    |

#### AnnotationSet Methods

| Method                    | Description              |
| ------------------------- | ------------------------ |
| `add(ref, annotation)`    | Add annotation to ref    |
| `add(ref, annotations[])` | Add multiple annotations |
| `add(source)`             | Add child annotation set |
| `remove(type)`            | Remove all of a type     |
| `remove(ref)`             | Remove all on a ref      |
| `remove(ref, type)`       | Remove type from ref     |
| `remove(source)`          | Remove child set         |
| `clear()`                 | Remove everything        |
| `lookup(ref, type)`       | Get first value          |
| `lookupAll(ref, type)`    | Get all values           |
| `ofType(type)`            | Filter by type           |
| `onRef(ref)`              | Filter by ref            |
| `onChildrenOf(ref)`       | Filter by children       |
| `onPartOf(ref)`           | Filter by subtree        |
| `subscribe(callback)`     | Subscribe to changes     |
| `on("change", callback)`  | Listen to change events  |
| `change(callback)`        | Batch operations         |

#### Iteration

```ts
// All entries
for (const [ref, annotation] of annotationSet) {
}

// All refs with annotations
for (const ref of annotationSet.refs) {
}
```

---

## Best Practices

1. **Use built-in annotation types** when possible. The ecosystem provides `CommentThread`, `Diff`, and `IsSelected`—use these rather than reinventing commenting, change tracking, or selection.

2. **Register with the annotation context**. Create your own `AnnotationSet` and add it to the shared context so other tools can see your annotations:

   ```ts
   import { annotations } from "@inkandswitch/annotations-context";

   const myAnnotations = new AnnotationSet();
   // ... add annotations to myAnnotations ...
   annotations.add(myAnnotations);
   ```

3. **Use namespaced type IDs** like `"myapp/bookmark"` for custom types to avoid conflicts.

4. **Prefer pattern matching** over indices for stable array refs:

   ```ts
   // Fragile: position-based
   ref(handle, "todos", 0);

   // Stable: ID-based
   ref(handle, "todos", { id: "abc123" });
   ```

5. **Use cursor ranges** for text selections to track positions through edits.

6. **Compose annotation sets** to layer different annotation sources.

7. **Clean up subscriptions** when components unmount.

8. **Batch related changes** with `annotations.change()` for performance.

---

## Part 4: Subscribables

The `@inkandswitch/subscribables` package provides a lightweight reactivity system for building observable values that work across frameworks. It's the foundation for reactive signals like `$selectedRefs` and other reactive APIs in the patchwork ecosystem.

### Installation

```bash
npm install @inkandswitch/subscribables
```

Framework bindings (install what you need):

```bash
npm install @inkandswitch/subscribables-react   # React hooks
npm install @inkandswitch/subscribables-solid   # Solid.js bindings
```

### Core Concepts

#### Subscribable Types

A `Subscribable` is anything you can subscribe to. There are two flavors:

**SubscribableValue** — wraps a value with a `subscribe` method:

```ts
type SubscribableValue<T> = {
  value: T;
  subscribe: (callback: (value: T) => void) => () => void;
};
```

**SubscribableObject** — the object itself is the value (like an `AnnotationSet`):

```ts
type SubscribableObject<T> = T & {
  subscribe: (callback: (value: T) => void) => () => void;
};
```

Use `valueOfSubscribable()` to get the value from either type:

```ts
import { valueOfSubscribable } from "@inkandswitch/subscribables";

const value = valueOfSubscribable(subscribable);
// Returns subscribable.value for SubscribableValue
// Returns subscribable itself for SubscribableObject
```

### Creating Subscribables

#### SubscriberSet

Use `SubscriberSet` to build your own subscribable objects:

```ts
import { SubscriberSet } from "@inkandswitch/subscribables";

class Counter {
  private count = 0;
  private subscribers = new SubscriberSet<Counter>();

  increment() {
    this.count++;
    this.subscribers.notify(this);
  }

  get value() {
    return this.count;
  }

  subscribe(callback: (counter: Counter) => void) {
    return this.subscribers.add(callback);
  }
}

const counter = new Counter();

const unsubscribe = counter.subscribe((c) => {
  console.log("Count is now:", c.value);
});

counter.increment(); // logs "Count is now: 1"
counter.increment(); // logs "Count is now: 2"

unsubscribe(); // stop listening
```

### Computed Subscribables

Derive new subscribables from existing ones with `computed()`. The derived value automatically updates when any source changes:

```ts
import { computed } from "@inkandswitch/subscribables";

const firstName: SubscribableValue<string> = /* ... */;
const lastName: SubscribableValue<string> = /* ... */;

// Compute a derived value
const fullName = computed(firstName, lastName, (first, last) => {
  return `${first} ${last}`;
});

console.log(fullName.value); // "John Doe"

// Subscribe to changes
fullName.subscribe((name) => {
  console.log("Full name changed to:", name);
});
```

Combine multiple sources:

```ts
const isLoggedIn: SubscribableValue<boolean> = /* ... */;
const userName: SubscribableValue<string> = /* ... */;
const userRole: SubscribableValue<"admin" | "user"> = /* ... */;

const greeting = computed(
  isLoggedIn,
  userName,
  userRole,
  (loggedIn, name, role) => {
    if (!loggedIn) return "Please log in";
    return role === "admin" ? `Welcome, Admin ${name}!` : `Hello, ${name}`;
  }
);
```

### Framework Integration

#### React

Use `useSubscribe` to bind subscribables to React component state:

```tsx
import { useSubscribe } from "@inkandswitch/subscribables-react";

function SelectedCount() {
  // Re-renders when $selectedRefs changes
  const selectedRefs = useSubscribe($selectedRefs);

  return <div>{selectedRefs.length} items selected</div>;
}

function UserGreeting({ user }: { user: SubscribableValue<User> }) {
  const userData = useSubscribe(user);

  return <h1>Hello, {userData.name}!</h1>;
}
```

The hook handles subscription lifecycle automatically—subscribing on mount, unsubscribing on unmount, and re-rendering when values change.

Optional subscribables return `undefined` when not provided:

```tsx
function MaybeSelected({ selection }: { selection?: SubscribableValue<Ref> }) {
  const selected = useSubscribe(selection); // Ref | undefined

  if (!selected) return <div>Nothing selected</div>;
  return <div>Selected: {selected.url}</div>;
}
```

#### Solid.js

Use `useSubscribe` to convert subscribables to Solid signals:

```tsx
import { useSubscribe } from "@inkandswitch/subscribables-solid";

function SelectedCount() {
  // Returns a Solid accessor
  const selectedRefs = useSubscribe($selectedRefs);

  return <div>{selectedRefs().length} items selected</div>;
}
```

For `SubscribableValue`, the hook uses Solid's `createStore` with `reconcile` for efficient deep updates. For `SubscribableObject`, it uses Solid's `from` to create a reactive signal.

### Utility Functions

Check which type of subscribable you have:

```ts
import {
  isSubscribableValue,
  valueOfSubscribable,
} from "@inkandswitch/subscribables";

if (isSubscribableValue(subscribable)) {
  // It's a SubscribableValue — access .value directly
  console.log(subscribable.value);
} else {
  // It's a SubscribableObject — the object IS the value
  console.log(subscribable);
}

// Or just use valueOfSubscribable for either case
const value = valueOfSubscribable(subscribable);
```

---

## Subscribables API Reference

### @inkandswitch/subscribables

| Export                     | Description                                |
| -------------------------- | ------------------------------------------ |
| `Subscribable<T>`          | Union type of SubscribableValue/Object     |
| `SubscribableValue<T>`     | Subscribable wrapping a value              |
| `SubscribableObject<T>`    | Subscribable where the object is the value |
| `SubscriberSet<T>`         | Helper class for managing subscriptions    |
| `computed(...sources, fn)` | Create a derived subscribable              |
| `valueOfSubscribable(s)`   | Get the value from any subscribable        |
| `isSubscribableValue(s)`   | Type guard for SubscribableValue           |

#### SubscriberSet Methods

| Method          | Description                                  |
| --------------- | -------------------------------------------- |
| `add(callback)` | Subscribe to changes, returns unsubscribe fn |
| `notify(value)` | Notify all subscribers with a value          |

### @inkandswitch/subscribables-react

| Export              | Description                           |
| ------------------- | ------------------------------------- |
| `useSubscribe(sub)` | React hook to bind subscribable state |

### @inkandswitch/subscribables-solid

| Export              | Description                                   |
| ------------------- | --------------------------------------------- |
| `useSubscribe(sub)` | Convert subscribable to Solid reactive signal |
