/** The state of the CatColab kernel consists of:
 *
 * 1. A hashmap with a uuid -> document map
 * 2. Memoized computations based on that hashmap
 *
 * For each document, we memoize:
 *
 * 1. The elaborated syntax of that document
 * 2. The value of that document, as a catlog model/diagram
 * 3. Possibly the result of analyses, in a fine-grained manner
 */
