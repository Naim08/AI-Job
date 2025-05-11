# Jobot: Automated Job Application Assistant (50% complete)

Jobot is an AI-powered desktop application that helps streamline your job search and application process. It scans LinkedIn for relevant job postings, analyzes them against your resume, and assists in automatically applying to matching opportunities.

## 🚀 Features

- **LinkedIn Job Scanner**: Automatically scans LinkedIn for jobs matching your keywords and locations
- **Smart Filtering**: Uses AI to match jobs with your resume and filters out blacklisted companies
- **Auto-Generated Responses**: Creates tailored answers to application questions and cover letters
- **One-Click Apply**: Automates the application submission process for compatible listings
- **Resume Management**: Upload and manage your resume with AI-powered analysis
- **Company Blacklist**: Automatically blacklists companies from your resume to avoid applying to past employers

## 🔧 Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, DaisyUI
- **Backend**: Electron, Node.js, Supabase
- **AI**: OpenAI API and/or Ollama (local LLM)
- **Automation**: Playwright for browser interaction
- **Authentication**: Supabase Auth with Google OAuth

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account for database and authentication
- OpenAI API key or Ollama installation (for AI features)

## 🔑 Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# Supabase Connection
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key  # For admin operations

# AI Configuration
AI_PROVIDER=openai  # or "ollama" for local models
OPENAI_API_KEY=your_openai_api_key  # Required if AI_PROVIDER=openai
OPENAI_MODEL_NAME=gpt-4o-mini  # or your preferred model

# Optional: Ollama Configuration (if using Ollama)
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:latest
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/jobot.git
cd jobot

# Install dependencies
npm install

# Start the development server
npm start
```

## 🛠️ Development

```bash
# Run in development mode
npm start

# Type check
npm run type-check

# Lint
npm run lint

# Package the app
npm run package

# Create distributables
npm run make
```

## 📁 Project Structure

```
jobot/
├── agent/              # AI and automation logic
│   ├── ai.ts           # AI model integration
│   ├── apply.ts        # Job application automation
│   ├── embeddings.ts   # Resume analysis and embedding
│   ├── filter.ts       # Job matching and filtering
│   ├── scanner.ts      # LinkedIn job scanning
│   └── session.ts      # Browser session management
│
├── electron/           # Electron-specific code
│   ├── main.ts         # Main process
│   ├── preload.ts      # Preload script
│   └── utils/          # Utilities
│
├── src/
│   ├── components/     # React components
│   ├── lib/            # Frontend libraries
│   ├── pages/          # Page components
│   ├── shared/         # Shared types and utilities
│   └── renderer.tsx    # Entry point for the renderer
│
└── supabase/
    └── migrations/     # Database migrations
```

## ⚙️ Configuration

### Job Search Configuration

You can configure your job search through the Settings page:
- **Keywords**: Add job titles or skills to search for
- **Locations**: Add locations or "Remote" to search in specific areas
- **Company Blacklist**: Companies to exclude from job searches
- **FAQ Settings**: Pre-fill common application questions and answers

### Resume Management

1. Upload your resume in PDF format
2. The system will:
   - Extract text content with AI
   - Generate embeddings for job matching
   - Automatically blacklist previous employers

## 🔄 Workflow

1. **Set Up**: Configure your profile, upload resume, and set job preferences
2. **Scan**: System scans LinkedIn for matching job opportunities
3. **Filter**: AI evaluates each job against your resume and preferences
4. **Review**: Review matched jobs in the History page
5. **Apply**: One-click apply with AI-generated responses for eligible jobs

## 🔒 Privacy & Security

- Your resume and application data are stored locally and in your personal Supabase instance
- API keys are stored securely using the OS keychain (via keytar)
- Browser sessions are managed securely with encrypted storage

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- Electron.js
- React
- Tailwind CSS & DaisyUI
- Supabase
- Playwright
- OpenAI
- Ollama

