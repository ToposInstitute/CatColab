import { createSignal, onMount, createEffect } from "solid-js";

interface SolidComponentProps {
  docUrl: string; // solid-element converts doc-url → docUrl
  message: string;
}

export function SolidComponent(props: SolidComponentProps) {
  const [count, setCount] = createSignal(0);
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setMounted(true);
    console.log("SolidJS component mounted with props:", props);
  });

  createEffect(() => {
    console.log("Props changed:", {
      docUrl: props.docUrl,
      message: props.message,
    });
  });

  const increment = () => setCount(count() + 1);
  const decrement = () => setCount(count() - 1);

  return (
    <div class="bg-blue-50 p-6 rounded-lg border-2 border-blue-200">
      <h3 class="text-lg font-bold text-blue-800 mb-4">
        🚀 SolidJS Component Inside React!
      </h3>

      <div class="space-y-4">
        <p class="text-gray-700">
          <strong>Message:</strong> {props.message}
        </p>

        <p class="text-gray-700">
          <strong>Doc URL:</strong>
          <code class="bg-gray-100 px-2 py-1 rounded text-sm ml-2">
            {props.docUrl}
          </code>
        </p>

        <div class="bg-white p-4 rounded border">
          <p class="text-sm text-gray-600 mb-2">
            SolidJS State (reactive counter):
          </p>
          <div class="flex items-center space-x-4">
            <button
              class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded"
              onClick={decrement}
            >
              -
            </button>
            <span class="text-xl font-mono">{count()}</span>
            <button
              class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded"
              onClick={increment}
            >
              +
            </button>
          </div>
        </div>

        <p class="text-xs text-gray-500">
          Component mounted: {mounted() ? "✅ Yes" : "❌ No"}
        </p>
      </div>
    </div>
  );
}
