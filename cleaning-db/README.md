# Database Cleaning and Grouping Utility

This utility connects to the Clofthel MongoDB database, extracts all anime metadata records using database projection, groups duplicate listings algorithmically based on title, format, and year, and formats the output into a simplified JSON schema for AI processing.

## Prerequisite
Ensure you have Node.js installed on your machine.

## Setup Instructions

1. Navigate to the utility directory:
   ```bash
   cd cleaning-db
   ```

2. Install the necessary dependencies:
   ```bash
   npm install
   ```

## Scripts

### 1. Database Grouping Draft (`clean_db.js`)
Extracts all anime metadata records from the database and creates a local raw draft.
*   **Run:** `npm run start` or `node clean_db.js`
*   **Output:** `raw_animes_draft.json`

### 2. Orchestrator Agent Layer (`orchestrator.js`)
Splits the raw draft records into chunks and passes them through an AI rotation layer to group, clean, and map them to their canonical main titles and seasons.
*   **Run:** `node orchestrator.js`
*   **Memory & Resume:** Creates `orchestrator_state.json` to store memory of mapped titles and keep track of completed chunks. If interrupted, running the script again resumes where it left off.
*   **Rotation Providers:** Dynamically falls back and rotates between Grok 4.5, Step 3.7 Flash, and GLM 4.7 Flash APIs if rate limits (429) or timeouts are hit.
*   **Output:** `final_clean_directory.json` containing the final clean directory structure.
