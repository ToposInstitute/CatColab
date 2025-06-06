// This file was generated by [ts-rs](https://github.com/Aleph-Alpha/ts-rs). Do not edit this file manually.

/**
 * A page of items along with pagination metadata.
 */
export type Paginated<T> = { 
/**
 * The total number of items matching the query criteria.
 */
total: number, 
/**
 * The number of items skipped.
 */
offset: number, 
/**
 * The items in the current page.
 */
items: Array<T>, };
