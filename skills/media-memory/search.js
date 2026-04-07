'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const OLLAMA_URL  = process.env.OLLAMA_URL        || 'http://localhost:11434';
const CHROMA_URL  = process.env.CHROMA_URL        || 'http://localhost:8000';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const COLLECTION  = 'media_memory';

async function embedQuery(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = await res.json();
  return data.embedding;
}

async function queryChroma(embedding, filters = {}, limit = 5) {
  const where = {};
  if (filters.type)   where.type   = { '$eq': filters.type };
  if (filters.source) where.source = { '$eq': filters.source };
  if (filters.tags)   where.tags   = { '$contains': filters.tags };

  const body = {
    query_embeddings: [embedding],
    n_results: limit,
    include: ['metadatas', 'documents', 'distances']
  };
  if (Object.keys(where).length > 0) body.where = where;

  const res = await fetch(`${CHROMA_URL}/api/v1/collections/${COLLECTION}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`ChromaDB query failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function formatResults(chromaResponse) {
  const metadatas = chromaResponse.metadatas?.[0] || [];
  const distances = chromaResponse.distances?.[0] || [];
  return metadatas.map((meta, i) => ({
    ...meta,
    score: distances[i] != null ? (1 - distances[i]).toFixed(3) : null,
    tags: typeof meta.tags === 'string' ? meta.tags.split(',').map(t => t.trim()) : meta.tags
  }));
}

async function search(query, filters = {}, limit = 5) {
  const embedding = await embedQuery(query);
  const raw       = await queryChroma(embedding, filters, limit);
  return formatResults(raw);
}

// CLI mode
if (require.main === module) {
  const args  = process.argv.slice(2);
  const query = args[0] || 'recent media';
  const limit = parseInt(args[1]) || 5;
  search(query, {}, limit)
    .then(results => {
      console.log(`\nTop ${results.length} results for: "${query}"\n`);
      results.forEach((r, i) => {
        console.log(`${i + 1}. [${r.type}] ${r.filename} (score: ${r.score})`);
        console.log(`   ${r.description}`);
        console.log(`   Tags: ${Array.isArray(r.tags) ? r.tags.join(', ') : r.tags}`);
        console.log(`   Path: ${r.file_path}\n`);
      });
    })
    .catch(err => console.error('Search failed:', err.message));
}

module.exports = { search, embedQuery, queryChroma };
