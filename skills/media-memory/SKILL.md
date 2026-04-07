# Media Memory Search Skill

Searches the local media memory system for past assets using semantic similarity.

## Trigger
Use this skill when:
- User asks "do we have a photo/video of X"
- User asks "find the image where..."
- User asks "show me past assets about X"
- A workflow needs to check if similar content already exists
- Context suggests a past generated asset may be relevant

## How it works
1. Embeds the user's query via Ollama (nomic-embed-text)
2. Queries ChromaDB collection "media_memory" for top-k semantic matches
3. Optionally filters by: type (image/video/audio/document), date range, source (telegram/workflow), tags
4. Returns top results with description, file path, and timestamp

## Usage
Call search.js with:
- query: natural language description of what to find
- filters: optional object with type, source, tags, date_from, date_to
- limit: number of results (default 5)

## Returns
Array of matches: { filename, type, timestamp, source, description, tags, file_path, score }
