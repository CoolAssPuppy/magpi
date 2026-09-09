# Retrieval

How Recall finds the chunks that answer a question, and what its recall actually
is once a permission filter is applied.

## The design

Hybrid retrieval. Two arms, merged with reciprocal rank fusion:

1. **Semantic.** pgvector cosine distance against `chunks.embedding`, a
   `vector(1536)` column indexed with HNSW using `vector_cosine_ops`,
   `m = 16`, `ef_construction = 64`.
2. **Lexical.** Postgres full text search against `chunks.tsv`, a stored
   generated `tsvector` over `content` with an `english` configuration, indexed
   with GIN. Queries go through `websearch_to_tsquery` and rank with
   `ts_rank_cd`.

Both arms live in one function, `public.search()`, declared in
`supabase/schemas/80_functions.sql`:

```sql
create or replace function public.search(
  query_embedding extensions.vector(1536),
  query_text text,
  space_filter uuid[] default null,
  match_count integer default 20
)
returns table (
  chunk_id uuid,
  document_id uuid,
  space_id uuid,
  content text,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
```

Three properties of that signature matter.

**`security invoker`.** The function runs as the caller, so the `chunks` row
level security policy applies to every call. That policy is
`chunks_select_visible`, which restricts rows to `space_id in (select
public.visible_space_ids())`. The permission check happens inside the vector
search rather than as a filter over its results, which is what makes the
two-user stage moment work: two people run the identical query against the
identical index and get different rows.

**One implementation.** Web, mobile and eventually the MCP server all call this
function. A second search implementation anywhere in the repository is a bug,
because a second implementation is a second place for the permission boundary to
be wrong.

**`space_filter` only ever narrows.** Passing an array of space ids
restricts the search further. It cannot add a space the caller could not already
see, because RLS still applies underneath it.

### How the two arms are merged

Each arm is ordered independently and truncated to `greatest(match_count * 4,
40)` rows. That over-fetch exists because reciprocal rank fusion only reorders
what it is given, so a candidate that neither arm returned cannot be recovered by
fusion.

The two candidate sets are combined with a full outer join on chunk id, and each
chunk scores:

```
score = 1 / (60 + semantic_rank) + 1 / (60 + lexical_rank)
```

with a missing rank contributing zero. The constant k = 60 is the value from the
original reciprocal rank fusion paper. It damps the contribution of low-ranked
hits without needing a per-corpus tuning pass, and it lets the two arms be
combined without normalizing a cosine distance against a `ts_rank_cd` score,
which are not comparable quantities.

A chunk that both arms rank highly beats a chunk that only one arm found.

### Why pure vector search is not enough

Ask "what is the SSO ticket number" of a pure embedding search. The query embeds
to a point near every document about single sign-on, authentication and identity
providers, because that is what the sentence is about. The chunk that actually
contains `ENG-2471` is one of hundreds nearby, and nothing in the vector space
distinguishes a string of digits from the text around it. Embeddings encode what
a passage means, and an identifier means almost nothing.

The lexical arm matches the literal token. `websearch_to_tsquery` turns the
question into terms, the GIN index finds the chunks containing `sso` and
`ticket`, and the exact chunk ranks first in that arm even when it ranks
fiftieth in the semantic one. Fusion then puts it in the answer.

This class of question is common in a knowledge base: ticket numbers, error
codes, person names, product SKUs, dates, version strings. It also fails
visibly, which is why it would happen on stage.

## Chunking

**Status: implemented.** `supabase/functions/_shared/chunking.ts` matches every
value below. If the implementation changes, this section changes in the same
commit.

| Property           | Value        | Reason                                                                                                                                                         |
| ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target chunk size  | 800 tokens   | Large enough that a paragraph keeps its context, small enough that a 20-chunk answer stays well inside the chat model's window with room for the conversation. |
| Overlap            | 100 tokens   | A sentence split across a boundary appears whole in one of the two chunks, so a fact that straddles a boundary is still retrievable.                           |
| Minimum chunk size | 100 tokens   | Fragments below this are merged into the previous chunk. A 12-token chunk embeds to noise and pollutes the semantic arm.                                       |
| Maximum chunk size | 1,200 tokens | A hard ceiling for the case where no boundary rule fires, so a single pathological paragraph cannot produce a chunk that dominates a result set.               |

Boundary rules, applied in order, splitting at the first rule that produces a
chunk inside the size band:

1. Markdown heading, at the highest heading level available.
2. Blank line, meaning a paragraph break.
3. Sentence end.
4. Whitespace, as the last resort before the hard ceiling.

Two rules that follow from the data model rather than from retrieval quality:

- Chunk ordinals are contiguous from zero within a document. `chunks` has a
  `unique (document_id, ordinal)` constraint, and citation rendering depends on
  ordinal order.
- Chunking is deterministic. The same input produces the same chunks, so a
  re-ingest of an unchanged document produces the same `content_hash` and does
  not churn citations in old conversations.

Token counts use the same tokenizer as the embedding model. Counting characters
and dividing is close enough to be wrong on code, tables and non-English text,
which the corpus contains.

## The known risk

An HNSW index scan walks a graph and stops after it has collected `ef_search`
candidates. When the query also filters on a subset of spaces, Postgres applies
that filter to the rows the graph walk returned. If the caller can see 1 percent
of the corpus, roughly 99 percent of what the walk collected is discarded, and
the result set comes back short or empty even though thousands of matching rows
exist further out in the graph.

This is the failure mode that turns the permission model from a strength into a
retrieval bug. It gets worse as the corpus grows, because the graph gets deeper
while `ef_search` stays fixed, and it gets worse as the filter gets more
selective, which is exactly the direction a real enterprise tenant moves in.

The mitigation is pgvector's iterative index scan. Setting
`hnsw.iterative_scan` lets the scan continue past its first batch until enough
rows survive the filter:

- `off` is the pgvector default and the failure case above.
- `strict_order` returns rows in exact distance order, at higher cost.
- `relaxed_order` allows slight reordering within the returned set and is
  cheaper.

`hnsw.max_scan_tuples` bounds the work so a query against a filter matching
nothing cannot walk the entire index.

### Measured, and settled

This is no longer hypothetical. pgTAP measured it on 2026-09-09 with a thousand
chunks in a space the caller cannot see, every one ranking nearer the query than
the five that are theirs, and query text matching nothing so the lexical arm
could not rescue the result:

| Configuration                    | Rows the caller gets, of 5 | Rows leaked |
| -------------------------------- | -------------------------- | ----------- |
| index scan, `iterative` off      | 0                          | 0           |
| index scan, `iterative` on       | 5                          | 0           |
| sequential scan, `iterative` off | 5                          | 0           |

Two things that table settles.

**It was never a leak.** Rows from the other space were invisible in every
configuration. A post-filter discards rows after the scan, so the worst it can do
is drop rows the caller was entitled to. The permission model held throughout.

**It was a total recall failure, not a partial one.** The caller's own document
existed, matched semantically, and the answer came back empty. It fails on the
paraphrase, which is the case vector search exists for, while the lexical arm
keeps the keyword case working and hides it.

The third row is why this needed measuring rather than reasoning about. At
test-corpus size the planner picks a sequential scan, which filters perfectly, so
any version of this test written without forcing the index passes forever and
proves nothing.

`public.search` therefore ships with the setting on the function itself:

```sql
alter function public.search(extensions.vector, text, uuid[], integer)
  set hnsw.iterative_scan = relaxed_order;
```

On the function rather than the role or the database, so web, mobile and the MCP
server all inherit it from the one implementation they already share.
`relaxed_order` rather than `strict_order` because `search` re-ranks with
reciprocal rank fusion afterwards, so paying for exact scan order buys nothing.

One gotcha worth writing down: until a vector operation has run in the session,
`hnsw.iterative_scan` is an unrecognised placeholder and the `alter function` is
refused with "permission denied to set parameter". The migration performs a
trivial cast above it.

What remains to be measured is the cost, not the correctness. The table
below is where that measurement goes.

## Recall measurement

Every value here is `not measured` as of 2026-09-09. Filter selectivity is the
fraction of chunks in the corpus that the querying user can see, which is the
`space_filter` and RLS predicate combined.

| Corpus size | Filter selectivity | recall@10    | p50 latency  | p95 latency  | `hnsw.iterative_scan` |
| ----------- | ------------------ | ------------ | ------------ | ------------ | --------------------- |
| 10k chunks  | 1 percent          | not measured | not measured | not measured | `off`                 |
| 10k chunks  | 1 percent          | not measured | not measured | not measured | `relaxed_order`       |
| 100k chunks | 1 percent          | not measured | not measured | not measured | `off`                 |
| 100k chunks | 1 percent          | not measured | not measured | not measured | `relaxed_order`       |
| 1M chunks   | 1 percent          | not measured | not measured | not measured | `off`                 |
| 1M chunks   | 1 percent          | not measured | not measured | not measured | `relaxed_order`       |

No latency claim goes on a keynote slide until these cells have numbers in them.
That includes a claim made in passing, in a rehearsal, or in a sentence that
starts with "roughly".

## The method

Written out so whoever runs the measurement does not have to invent a protocol,
and so a second run three weeks later is comparable with the first.

### Corpus

Synthetic chunks generated to the three sizes, embedded with the pinned
embedding model from `docs/limits.md`. Spaces are allocated so that exactly 1
percent of chunks fall inside the querying user's `visible_space_ids()`, spread
across several spaces rather than concentrated in one, because a single
contiguous space is an easier case than a scattered one and would flatter the
result.

The generation script and the fixed random seed are committed, so the corpus is
reproducible rather than described.

### Ground truth

For each query, the exact top 10 is computed by an exhaustive scan: the same
cosine expression over the same filtered row set with `enable_indexscan = off`
and `enable_bitmapscan = off`, forcing a sequential scan. This is slow by
design and it is the definition of correct. It runs once per query per corpus
size and the result is cached to disk.

The filter used for ground truth is the same predicate the indexed query uses.
Comparing an index scan under a permission filter against an exhaustive scan
without one measures the filter rather than the index.

### recall@10

For each query, the intersection of the indexed top 10 with the exhaustive top
10, divided by 10. The reported figure is the mean across the query set, and the
run also records the tenth percentile, because a mean of 0.94 hiding a tail of
queries at 0.3 is the case that produces a visibly wrong answer on stage.

recall@10 is measured on the semantic arm alone. The lexical arm has no
approximate index and no recall question to answer, and fusing the two before
measuring would let a strong lexical result hide a degraded vector scan.

### Query set

200 queries per corpus size, each embedded once and reused across every cell in
the row so the same vectors run against every `iterative_scan` setting. The
queries are generated in three groups of equal size:

- Questions whose answer sits inside the visible 1 percent.
- Questions whose answer sits outside it, which measure that the filter holds.
- Exact-match questions containing an identifier, which exercise the lexical arm.

### Warm and cold

Both are reported, separately, and never averaged together.

**Cold** is the first execution after a `discard all` and a restart of the
database container, with no prewarming. It is the number a user sees when their
tenant has been idle.

**Warm** is measured after 20 discarded warmup queries against the same index,
with the index resident in shared buffers. It is the number the demo will show.

Latency is measured server side from `explain (analyze, buffers)` execution
time rather than from the client, so network time and connection setup stay out
of the figure. Each query runs five times at each setting and the median of the
five is the sample; p50 and p95 are then computed across the 200 samples.

### What gets recorded

Every run records the date, the pgvector version, the Postgres version, the
Supabase compute size, `ef_search`, `hnsw.max_scan_tuples`, and the corpus seed,
alongside the numbers. A cell without those is not reproducible and does not go
in the table.
