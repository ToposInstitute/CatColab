import { useDocHandle } from "@automerge/automerge-repo-react-hooks";
import { EditorProps } from "@patchwork/sdk";
import { Button } from "@patchwork/sdk/ui";
import { Doc } from "./datatype";
import React, { useRef, useEffect } from "react";
import { renderSolidComponent } from "./solid-wrapper.solid";

console.log("This is tool.tsx in the solidjs-demo package");

export const Tool: React.FC<EditorProps<Doc, string>> = ({ docUrl }) => {
  const handle = useDocHandle<Doc>(docUrl, { suspense: true });
  const solidContainerRef = useRef<HTMLDivElement>(null);
  const solidDisposeRef = useRef<(() => void) | null>(null);

  const doc = handle.doc();

  // Mount/update SolidJS component
  useEffect(() => {
    if (solidContainerRef.current && doc) {
      // Clean up previous render
      if (solidDisposeRef.current) {
        solidDisposeRef.current();
      }

      // Render SolidJS component
      const props = { docUrl, message: doc.message };
      solidDisposeRef.current = renderSolidComponent(
        props,
        solidContainerRef.current
      );
    }

    // Cleanup on unmount
    return () => {
      if (solidDisposeRef.current) {
        solidDisposeRef.current();
        solidDisposeRef.current = null;
      }
    };
  }, [docUrl, doc?.message]);

  if (!doc) {
    return null;
  }

  const updateMessage = () => {
    handle.change((d) => {
      d.message = `Hello from SolidJS! Updated at ${new Date().toLocaleTimeString()}`;
    });
  };

  return (
    <div className="solidjs-demo p-6">
      <div className="flex flex-col h-full">
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-2 text-gray-800">{doc.title}</h2>
          <p className="text-gray-600">
            This demo shows how to embed a SolidJS component inside a React app!
          </p>
        </div>

        <div className="mb-6">
          <Button
            variant="default"
            onClick={updateMessage}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Update Message from React
          </Button>
        </div>

        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-gray-600">
            <strong>Debug info:</strong>
            <br />
            Doc URL: <code className="text-xs">{docUrl}</code>
            <br />
            Message: <code className="text-xs">{doc.message}</code>
            <br />
            Doc URL length: <code className="text-xs">{docUrl.length}</code>
          </p>
        </div>

        <div className="flex-1">
          <div ref={solidContainerRef} />
        </div>

        <div className="mt-6 p-4 bg-gray-100 rounded-lg">
          <h4 className="font-semibold text-gray-700 mb-2">
            🔧 How this works:
          </h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• React component renders the main UI</li>
            <li>
              • SolidJS component is rendered directly into a div container
            </li>
            <li>• No custom elements - just direct SolidJS render() calls</li>
            <li>• Both frameworks can manage their own state</li>
            <li>• Props are passed directly as function arguments</li>
            <li>• Supports hot reloading!</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
