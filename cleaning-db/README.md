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

3. Run the script:
   ```bash
   npm start
   ```

## Output
The script generates a file named `raw_animes_draft.json` in this directory containing all cleaned and grouped anime records sorted alphabetically by `original_title`.
