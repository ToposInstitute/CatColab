import type { ModelDocument } from "catcolab-document-methods";
import type { Link } from "catcolab-document-types";
import {
	type Binder,
	binder,
	createBinder,
	type DocumentStore,
	Instantiation,
} from "catcolab-documents";
import { PetriNet, Place } from "catcolab-logics/petri-net";
import { SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { DblModel } from "catlog-wasm";
import { v7 } from "uuid";
import { describe, expect, test } from "vitest";

// The shapes whose documents this store can resolve, looked up by the
// document's `theory` id so a referenced model is validated against its own
// shape (and thus its own core theory): a Petri-net model resolves against
// `ThSymMonoidalCategory` while an olog resolves against `ThCategory`.
const resolvableShapes = [SimpleOlog, PetriNet];

const shapeFor = (theory: string) =>
	resolvableShapes.find((shape) => shape.theory === theory);

// A plain store augmented with `resolveModel`, so notebooks containing
// instantiation cells can be validated. Documents are registered by a stable
// id; `resolveModel` resolves a referenced model by attaching a notebook to its
// handle and calling `validate()`, reusing the notebook machinery (which walks
// the model's own instantiations and elaborates against the shape's core
// theory) rather than reimplementing it. The store only tracks ids whose
// resolution is in progress, to detect cyclic instantiations.
function createResolvingStore(): {
	store: DocumentStore<ModelDocument>;
	failOnResolve: { value: boolean };
} {
	const ids = new WeakMap<ModelDocument, string>();
	const byId = new Map<string, ModelDocument>();
	const failOnResolve = { value: false };
	// Ids whose resolution is in progress, used to detect cyclic instantiations.
	const resolving = new Set<string>();
	// Assigned below; a binder over this same store, used to attach a notebook
	// to a referenced document's handle so its own `validate()` can be run.
	let selfBinder: Binder<ModelDocument>;

	const idFor = (doc: ModelDocument): string => {
		let id = ids.get(doc);
		if (!id) {
			id = v7();
			ids.set(doc, id);
			byId.set(id, doc);
		}
		return id;
	};

	const resolveModel = async (link: Link): Promise<DblModel> => {
		if (failOnResolve.value) {
			throw new Error("resolver unavailable");
		}
		if (resolving.has(link._id)) {
			throw new Error(
				`Cyclic instantiation detected while resolving model ${link._id}.`,
			);
		}
		const doc = byId.get(link._id);
		if (!doc) {
			throw new Error(`unknown model ${link._id}`);
		}
		const shape = shapeFor(doc.theory);
		if (!shape) {
			throw new Error(
				`No shape registered for document theory "${doc.theory}"`,
			);
		}
		resolving.add(link._id);
		try {
			// Resolve by validating the referenced notebook: `validate()` walks
			// its instantiations (calling back into this `resolveModel` for each,
			// so the `resolving` set catches cycles) and elaborates against the
			// shape's core theory.
			const result = await selfBinder
				.loadNotebookFromHandle(shape, doc)
				.validate();
			if (result.tag === "Illformed") {
				throw new Error(result.error);
			}
			return result.model;
		} finally {
			resolving.delete(link._id);
		}
	};

	const store: DocumentStore<ModelDocument> = {
		createHandle: (initialDoc) => {
			const doc = initialDoc as ModelDocument;
			idFor(doc);
			return doc;
		},
		viewDocument: (handle) => handle,
		changeDocument: (handle, fn) => fn(handle),
		copyValue: (_handle, value) => structuredClone(value),
		linkForHandle: (handle) => ({
			_id: idFor(handle),
			_version: null,
			_server: "",
		}),
		resolveModel,
	};

	selfBinder = createBinder(store);

	return { store, failOnResolve };
}

describe("instantiation validation", () => {
	test("a notebook with an instantiation validates to Valid", async () => {
		const { store } = createResolvingStore();
		const resolvingBinder = createBinder(store);

		const imported = resolvingBinder.createNotebook(SimpleOlog, {
			name: "Imported",
		});
		imported.add(Type, { name: "Thing" });

		const notebook = resolvingBinder.createNotebook(SimpleOlog, {
			name: "Main",
		});
		notebook.add(Type, { name: "A" });
		notebook.add(Instantiation, {
			name: "ImportedOlog",
			model: imported,
		});

		const result = await notebook.validate();
		expect(result.tag).toBe("Valid");
		expect(result.model).toBeInstanceOf(DblModel);
	});

	test("the plain store resolves an instantiation of a locally-validated model", async () => {
		const imported = binder.createNotebook(SimpleOlog, { name: "Imported" });
		imported.add(Type, { name: "Thing" });
		// Validating the imported notebook elaborates it; the plain store caches
		// the resulting model so the instantiation below can resolve it.
		expect((await imported.validate()).tag).toBe("Valid");

		const notebook = binder.createNotebook(SimpleOlog, { name: "Main" });
		notebook.add(Type, { name: "A" });
		notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

		const result = await notebook.validate();
		expect(result.tag).toBe("Valid");
		expect(result.model).toBeInstanceOf(DblModel);
	});

	test("a failed resolution is reported as Illformed", async () => {
		const { store, failOnResolve } = createResolvingStore();
		const resolvingBinder = createBinder(store);

		const imported = resolvingBinder.createNotebook(SimpleOlog, {
			name: "Imported",
		});
		imported.add(Type, { name: "Thing" });

		const notebook = resolvingBinder.createNotebook(SimpleOlog, {
			name: "Main",
		});
		notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

		failOnResolve.value = true;
		const result = await notebook.validate();
		expect(result.tag).toBe("Illformed");
		expect(result.tag === "Illformed" && result.error).toContain(
			"Failed to resolve",
		);
	});

	test("resolveModel elaborates the referenced document against its own theory", async () => {
		const { store } = createResolvingStore();
		const resolvingBinder = createBinder(store);

		// A Petri-net model elaborates against `ThSymMonoidalCategory`, so the
		// resolver must look its theory up by the document's `theory` id rather
		// than assuming an olog's `ThCategory`.
		const imported = resolvingBinder.createNotebook(PetriNet, {
			name: "Imported",
		});
		imported.add(Place, { name: "S" });

		const notebook = resolvingBinder.createNotebook(PetriNet, { name: "Main" });
		notebook.add(Place, { name: "A" });
		notebook.add(Instantiation, { name: "ImportedNet", model: imported });

		const result = await notebook.validate();
		expect(result.tag).toBe("Valid");
		expect(result.model).toBeInstanceOf(DblModel);
	});

	test("resolveModel recursively resolves the referenced model's own instantiations", async () => {
		const { store } = createResolvingStore();
		const resolvingBinder = createBinder(store);

		// `inner` <- `imported` <- `main`: resolving `imported` must in turn
		// resolve its instantiation of `inner`, so it elaborates against a
		// populated map rather than an empty one.
		const inner = resolvingBinder.createNotebook(SimpleOlog, { name: "Inner" });
		inner.add(Type, { name: "Thing" });

		const imported = resolvingBinder.createNotebook(SimpleOlog, {
			name: "Imported",
		});
		imported.add(Type, { name: "B" });
		imported.add(Instantiation, { name: "InnerOlog", model: inner });

		const notebook = resolvingBinder.createNotebook(SimpleOlog, {
			name: "Main",
		});
		notebook.add(Type, { name: "A" });
		notebook.add(Instantiation, { name: "ImportedOlog", model: imported });

		const result = await notebook.validate();
		expect(result.tag).toBe("Valid");
		expect(result.model).toBeInstanceOf(DblModel);
	});

	test("a cyclic instantiation is detected and reported as Illformed", async () => {
		const { store } = createResolvingStore();
		const resolvingBinder = createBinder(store);

		// A instantiates C and C instantiates A: a cycle. The resolver tracks
		// ids whose resolution is in progress and rejects when one recurs.
		const a = resolvingBinder.createNotebook(SimpleOlog, { name: "A" });
		const c = resolvingBinder.createNotebook(SimpleOlog, { name: "C" });
		a.add(Type, { name: "TA" });
		c.add(Type, { name: "TC" });
		a.add(Instantiation, { name: "toC", model: c });
		c.add(Instantiation, { name: "toA", model: a });

		const result = await a.validate();
		expect(result.tag).toBe("Illformed");
		expect(result.tag === "Illformed" && result.error).toContain(
			"Cyclic instantiation",
		);
	});
});
