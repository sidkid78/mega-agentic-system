# Mega Agentic System - API Server

FastAPI backend server that bridges the Next.js frontend with the Python Mega Agentic System.

## Setup

### Install Dependencies

```bash
cd backend
uv sync
```

This will install all required dependencies including FastAPI and uvicorn.

### Run the Server

```bash
uv run python api_server.py
```

Or using uvicorn directly:

```bash
uv run uvicorn api_server:app --reload --host 0.0.0.0 --port 8010
```

The API will be available at `http://localhost:8010`

## API Endpoints

### Health & Info

- `GET /` - API information
- `GET /health` - Health check

### Tasks

- `POST /tasks` - Create and execute a new task
- `GET /tasks/{task_id}` - Get task status and results
- `GET /tasks` - List all tasks (with pagination)

### System Management

- `GET /metrics` - Get system performance metrics
- `GET /modes` - Get available agent modes
- `GET /complexities` - Get available complexity levels
- `POST /system/optimize` - Trigger system optimization
- `POST /system/save` - Save system state

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8010/docs`
- ReDoc: `http://localhost:8010/redoc`

## Example Request

```bash
curl -X POST "http://localhost:8010/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Design a REST API for user management",
    "complexity": "moderate",
    "quality_threshold": 8.0,
    "max_iterations": 3
  }'
```

## CORS

The API is configured to allow requests from:
- `http://localhost:3000` (Next.js dev server)
- `http://127.0.0.1:3000`

To add more origins, edit the `CORSMiddleware` configuration in `api_server.py`.

## State Management

The system automatically:
- Loads previous state on startup (if `mega_system_state.pkl` exists)
- Saves state on shutdown
- Maintains in-memory task store (in production, use a database)

## Production Considerations

For production deployment:

1. **Database**: Replace in-memory `task_store` with a proper database (PostgreSQL, MongoDB, etc.)
2. **Authentication**: Add API key or OAuth authentication
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Logging**: Set up proper logging and monitoring
5. **Error Handling**: Enhance error handling and validation
6. **WebSockets**: Add WebSocket support for real-time updates instead of polling

