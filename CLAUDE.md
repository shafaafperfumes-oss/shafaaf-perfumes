# Shafaaf Perfumes — Project Instructions

## Project Context
- E-commerce website for Shafaaf Perfumes (luxury perfume/attar brand)
- Frontend: HTML, CSS, JavaScript (already built and pushed to GitHub)
- Backend (in progress): Node.js + Express
- Database: Supabase
- Design goal: premium, modern, and fully responsive (mobile-friendly), matching current luxury e-commerce design trends

## Working Style
- The project owner is non-technical — explain each step in plain, simple language before making changes
- Work in small, incremental steps — one feature or change at a time
- Before modifying or deleting any file, explain what will change and why
- Never overwrite or delete a file without explicit confirmation first
- After completing each meaningful step, make a Git commit with a clear, descriptive commit message

## Security Rules
- Never hardcode API keys, passwords, database credentials, or any other secrets directly in the code
- All secrets must go in a `.env` file
- The `.env` file must be listed in `.gitignore` so it is never pushed to GitHub
- Reference secrets only via environment variables in code, never as literal values

## Connectors / Tools
- Keep integrations minimal: GitHub (for version control and push) and the hosting provider (e.g. Vercel) only
- Do not add other third-party connectors or services unless explicitly requested

## Current Status
- Frontend: complete, pushed to GitHub
- Next step: build a backend API that fetches product data from Supabase, replacing the hardcoded product data currently in the frontend
- After that: cart and order handling, then payment/checkout integration
