# Mega Agentic System - Frontend

Modern Next.js frontend for the Ultimate Multi-Pattern AI Orchestration Platform.

## Features

- 🎯 **Task Management**: Create and monitor AI tasks with real-time updates
- 📊 **Performance Dashboard**: View system metrics and execution history
- 🎨 **Beautiful UI**: Modern, responsive design with dark mode support
- ⚡ **Real-time Updates**: Automatic polling for running tasks
- 📝 **Markdown Rendering**: Rich output display with markdown support

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun

### Installation

```bash
cd frontend
npm install
```

### Environment Variables

Create a `.env.local` file in the `frontend` directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:8010
```

### Running the Frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running the Backend

In a separate terminal:

```bash
cd backend
uv sync
uv run python api_server.py
```

The API server will run on `http://localhost:8010`.

## Project Structure

```
frontend/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout with theme provider
│   └── page.tsx           # Main dashboard page
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── task-form.tsx      # Task creation form
│   ├── task-list.tsx      # Task list with real-time updates
│   ├── task-detail.tsx    # Detailed task view
│   ├── metrics-dashboard.tsx  # System metrics dashboard
│   └── theme-toggle.tsx   # Dark mode toggle
└── lib/
    └── api.ts             # API client for backend communication
```

## Features Overview

### Dashboard Tab
- Create new tasks
- View recent tasks
- Monitor task execution in real-time
- View detailed task results

### Tasks Tab
- Full task management interface
- Create and monitor multiple tasks
- Detailed task views

### Metrics Tab
- System performance overview
- Mode performance statistics
- Recent execution history

## API Integration

The frontend communicates with the FastAPI backend through the `apiClient` in `lib/api.ts`. All API calls are typed and handle errors gracefully.

## Development

### Adding New Components

Components follow the shadcn/ui pattern. Use the existing components as reference.

### Styling

The project uses Tailwind CSS v4 with the zinc color scheme. Dark mode is supported via `next-themes`.

## Next Steps

- [ ] Add WebSocket support for real-time updates
- [ ] Add integration pages for other backend modules (image gen, code gen, etc.)
- [ ] Add task filtering and search
- [ ] Add export functionality for results
- [ ] Add user authentication
