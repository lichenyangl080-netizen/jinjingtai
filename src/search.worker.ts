import { buildSearchIndex, searchDocuments } from "./search-index.ts";
import type { SearchDocument, SearchQuery } from "./search-index.ts";
import type { Store } from "./model.ts";
let documents: SearchDocument[] = [];
let generation = -1;
let libraryId = "";
self.onmessage = (
  event: MessageEvent<
    | { type: "index"; store: Store; libraryId: string; generation: number }
    | {
        type: "query";
        query: SearchQuery;
        requestId: number;
        generation: number;
      }
  >,
) => {
  const message = event.data;
  if (message.type === "index") {
    documents = buildSearchIndex(message.store);
    generation = message.generation;
    libraryId = message.libraryId;
    self.postMessage({ type: "indexed", generation, libraryId });
  } else if (message.generation === generation) {
    self.postMessage({
      type: "results",
      results: searchDocuments(documents, message.query),
      requestId: message.requestId,
      generation,
      libraryId,
    });
  }
};
