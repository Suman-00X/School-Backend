import { sql } from "drizzle-orm";

/* Readable 409 messages for unique indexes, by index name. Modules register theirs
   in their repository; the error handler uses them when a write hits the index.

     describeDuplicates({
       fee_heads_tenant_name_uq: ({ name }) => `A fee head named ${name} already exists`
     });

   The builder gets the index's key values by API field name (tenantId left out). A value
   the request body holds in another case or spacing ("tuition" for "Tuition") is given
   as the client sent it. Indexes without a message get a generic one. */
const builders = new Map();

export const describeDuplicates = messages => {
  for (const [indexName, build] of Object.entries(messages)) builders.set(indexName, build);
};

/* -> the registered message, or null */
export const duplicateMessage = (indexName, values) => builders.get(indexName)?.(values) ?? null;

/* Case-insensitive equality, for checks that mirror a unique index on lower(column) */
export const sameText = (column, value) => sql`lower(${column}) = lower(${value})`;
