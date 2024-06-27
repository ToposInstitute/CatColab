type Observer<State, Diff> = {
  observe: (diff: Diff, state0: State, state1: State) => void;
};

type SubscriptionHandle = {
  id: number;
};

type Comonoid<State, Diff> = {
  codomain: (state: State, diff: Diff) => State | null;
  identity: (state: State) => Diff;
  compose: (state: State, diff0: Diff, diff1: Diff) => Diff | null;
};

type Functor<State1, Diff1, State2, Diff2> = {
  domain: Comonoid<State1, Diff1>;
  codomain: Comonoid<State2, Diff2>;
  mapState: (state: State1) => State2;
  mapDiff: (state: State1, diff: Diff1) => Diff2;
};

function listComonoid<T>(): Comonoid<T[], ListDiff<T>> {
  function codomain(state: T[], diff: ListDiff<T>) {
    const newState = state.slice();
    for (const change of diff.changes) {
      if (change.tag == "insert") {
        newState.splice(change.at, 0, change.value);
      } else if (change.tag == "delete") {
        newState.splice(change.at, 1);
      }
    }
    return newState;
  }

  function identity(state: T[]) {
    return { changes: [] };
  }

  function compose(state: T[], diff1: ListDiff<T>, diff2: ListDiff<T>) {
    return { changes: diff1.changes.slice().concat(diff2.changes) };
  }

  return { codomain, identity, compose };
}

function listMap<T, S>(
  f: (x: T) => S,
): Functor<T[], ListDiff<T>, S[], ListDiff<S>> {
  return {
    domain: listComonoid<T>(),
    codomain: listComonoid<S>(),
    mapState: (state) => state.map(f),
    mapDiff: (_state, diff) => {
      return {
        changes: diff.changes.map((change) => {
          if (change.tag == "insert") {
            return {
              tag: "insert",
              at: change.at,
              value: f(change.value),
            };
          } else if (change.tag == "delete") {
            return change;
          } else {
            return change;
          }
        }),
      };
    },
  };
}

type Insert<T> = {
  tag: "insert";
  at: number;
  value: T;
};

type Delete = {
  tag: "delete";
  at: number;
};

type Change<T> = Insert<T> | Delete;

type ListDiff<T> = {
  changes: Change<T>[];
};

class DeltaSignal<State, Diff> {
  state: State;
  nextId: number;
  observers: Map<number, Observer<State, Diff>>;
  comonoid: Comonoid<State, Diff>;

  constructor(init: State, comonoid: Comonoid<State, Diff>) {
    this.state = init;
    this.nextId = 0;
    this.observers = new Map();
    this.comonoid = comonoid;
  }

  subscribe(observer: Observer<State, Diff>): SubscriptionHandle {
    const id = this.nextId;
    this.nextId += 1;
    this.observers.set(id, observer);
    return { id };
  }

  unsubscribe(handle: SubscriptionHandle) {
    this.observers.delete(handle.id);
  }

  update(diff: Diff) {
    const nextState = this.comonoid.codomain(this.state, diff);
    if (nextState === null) {
      return;
    }
    for (const observer of this.observers.values()) {
      observer.observe(diff, this.state, nextState);
    }
    this.state = nextState;
  }

  map<State2, Diff2>(
    f: Functor<State, Diff, State2, Diff2>,
  ): DeltaSignal<State2, Diff2> {
    const derived = new DeltaSignal(f.mapState(this.state), f.codomain);
    this.subscribe({
      observe: (diff) => {
        derived.update(f.mapDiff(this.state, diff));
      },
    });
    return derived;
  }
}

interface Modifier<Element> {
  apply(el: Element): SubscriptionHandle | void;
}

class AttributeSetter implements Modifier<HTMLElement> {
  name: string;
  signal: DeltaSignal<string, string>;

  constructor(name: string, signal: DeltaSignal<string, string>) {
    this.name = name;
    this.signal = signal;
  }

  apply(el: HTMLElement) {
    el.setAttribute(this.name, this.signal.state);

    return this.signal.subscribe({
      observe: (newVal) => {
        el.setAttribute(this.name, newVal);
      },
    });
  }
}

class ChildrenSetter implements Modifier<HTMLElement> {
  signal: DeltaSignal<HTMLElement[], ListDiff<HTMLElement>>;

  constructor(signal: DeltaSignal<HTMLElement[], ListDiff<HTMLElement>>) {
    this.signal = signal;
  }

  apply(el: HTMLElement) {
    el.replaceChildren(...this.signal.state);
    return this.signal.subscribe({
      observe: (diff) => {
        for (const change of diff.changes) {
          if (change.tag == "insert") {
            if (change.at == el.children.length) {
              el.appendChild(change.value);
            } else if (change.at < el.children.length) {
              el.insertBefore(el.children[change.at], change.value);
            } else {
              throw new Error("DOM out of sync!!");
            }
          } else if (change.tag == "delete") {
            el.removeChild(el.children[change.at]);
          }
        }
      },
    });
  }
}

class ContentSetter implements Modifier<HTMLElement> {
  signal: DeltaSignal<string, string>;

  constructor(signal: DeltaSignal<string, string>) {
    this.signal = signal;
  }

  apply(el: HTMLElement) {
    el.innerHTML = this.signal.state;
    return this.signal.subscribe({
      observe: (newVal) => {
        el.innerHTML = newVal;
      },
    });
  }
}

class Attribute implements Modifier<HTMLElement> {
  name: string;
  value: string;

  constructor(name: string, value: string) {
    this.name = name;
    this.value = value;
  }

  apply(el: HTMLElement) {
    el.setAttribute(this.name, this.value);
  }
}

class Text implements Modifier<HTMLElement> {
  text: string;

  constructor(text: string) {
    this.text = text;
  }

  apply(el: HTMLElement) {
    el.innerText = this.text;
  }
}

class Children implements Modifier<HTMLElement> {
  children: HTMLElement[];

  constructor(children: HTMLElement[]) {
    this.children = children;
  }

  apply(el: HTMLElement) {
    el.replaceChildren(...this.children);
  }
}

class EventListener implements Modifier<HTMLElement> {
  eventType: string;
  listener: any;

  constructor(eventType: string, listener: any) {
    this.eventType = eventType;
    this.listener = listener;
  }

  apply(el: HTMLElement) {
    el.addEventListener(this.eventType, this.listener);
  }
}

function element(tag: string, modifiers: Modifier<HTMLElement>[]): HTMLElement {
  const el = document.createElement(tag);
  for (const mod of modifiers) {
    mod.apply(el);
  }
  return el;
}

export function todoApp() {
  const state = new DeltaSignal<string[], ListDiff<string>>([], listComonoid());

  const children = state.map(listMap((v) => element("li", [new Text(v)])));

  const list = element("ul", [new ChildrenSetter(children)]);

  const button = element("button", [
    new EventListener("click", (_evt: any) => {
      state.update({
        changes: [
          { tag: "insert", at: state.state.length, value: "cash checks" },
        ],
      });
    }),
    new Text("add task"),
  ]);

  const removeButton = element("button", [
    new EventListener("click", (_evt: any) => {
      state.update({
        changes: [{ tag: "delete", at: state.state.length - 1 }],
      });
    }),
    new Text("remove task"),
  ]);

  return element("div", [new Children([list, button, removeButton])]);
}
