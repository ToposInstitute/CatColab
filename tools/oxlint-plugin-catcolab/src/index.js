/** Custom oxlint rules for the CatColab codebase.

Loaded through oxlint's `jsPlugins` (ESLint-compatible plugin API).
*/

/** Disallow conditional expressions in JSX spread attributes.

Solid compiles a JSX spread into `mergeProps`, whose proxy re-evaluates the
spread expression whenever *any* prop absent from the sibling static props is
read. A spread like `{...(open === undefined ? {} : { open })}` therefore
silently subscribes unrelated computations in the receiving component to
`open`.
*/
const noConditionalJsxSpread = {
    meta: {
        type: "problem",
        docs: {
            description: "Disallow conditional expressions in JSX spread attributes.",
        },
        messages: {
            conditionalSpread:
                "Conditional JSX spread compiles into `mergeProps`, silently subscribing " +
                "unrelated computations in the receiving component to the condition. " +
                "Pass the prop directly, widening the receiving prop's type with " +
                "`| undefined` if needed.",
        },
    },
    create(context) {
        return {
            JSXSpreadAttribute(node) {
                const { argument } = node;
                if (
                    argument.type === "ConditionalExpression" ||
                    argument.type === "LogicalExpression"
                ) {
                    context.report({ node, messageId: "conditionalSpread" });
                }
            },
        };
    },
};

export default {
    meta: {
        name: "catcolab",
    },
    rules: {
        "no-conditional-jsx-spread": noConditionalJsxSpread,
    },
};
