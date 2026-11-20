# Backend Proof-of-Concept: Express.js vs. FastAPI Task API

A side-by-side implementation of an identical **Task / Ticket Tracker REST API** in both **Node.js (Express)** and **Python (FastAPI)** within a single monorepo.

This project demonstrates how both ecosystems approach:
- **Routing & Endpoint Declaration**
- **Request Body Parsing & Serialization**
- **Schema Validation & Type Coercion** (`Zod` in Node.js vs. `Pydantic v2` in Python)
- **Status Codes & Error Handling Normalization**
- **Query Parameter Filtering & Querying**

---

## Repository Structure

```
backend-poc/
├── express-api/
│   ├── package.json        # Dependencies (express, zod, cors)
│   └── server.js           # Server, routes, Zod schemas, error handling
├── fastapi-api/
│   ├── requirements.txt    # Dependencies (fastapi, uvicorn, pydantic)
│   └── main.py             # Server, routes, Pydantic models, error handlers
├── test_apis.js            # Automated parity verification script
└── README.md               # Architecture documentation & comparison guide
```

---

## Architectural & Feature Comparison

| Dimension | Node.js (Express) | Python (FastAPI) |
| :--- | :--- | :--- |
| **Runtime / Engine** | Node.js (V8 event loop, single-threaded async) | Python 3.10+ (uvloop / asyncio, ASGI) |
| **Web Framework** | Express 4.x (Minimalist, unopinionated) | FastAPI (Modern, type-hint driven, high performance) |
| **HTTP Server** | Built-in Node `http` module | Uvicorn (Lightning-fast ASGI server) |
| **Schema Validation** | `Zod` (TypeScript/JavaScript schema validation) | `Pydantic v2` (Rust-backed validation engine) |
| **Route Definition** | `app.get()`, `app.post()`, `app.patch()`, etc. | `@app.get()`, `@app.post()`, `@app.patch()`, etc. |
| **Request Parsing** | Explicit middleware (`express.json()`) | Automatic request body deserialization via type annotations |
| **Path & Query Extraction** | Extracted from `req.params` and `req.query` | Injected into route handler function arguments directly |
| **Validation Flow** | Custom middleware (`validateBody(Schema)`) | Automatic framework-level validation via Pydantic model |
| **API Documentation** | Manual or third-party (swagger-ui-express) | Built-in auto-generated Swagger UI (`/docs`) & ReDoc (`/redoc`) |
| **Default Port** | `3000` | `8000` |

---

## Task Data Model

Both services implement the exact same entity schema:

```json
{
  "id": "task-1",
  "title": "Set up CI/CD pipeline",
  "description": "Configure GitHub Actions for automated testing and linting",
  "status": "in_progress",
  "priority": "high",
  "created_at": "2026-11-20T08:00:00.000Z",
  "updated_at": "2026-11-20T08:00:00.000Z"
}
```

- **`id`**: String unique identifier (`task-<uuid>`).
- **`title`**: String (1–100 characters, trimmed, required).
- **`description`**: String (optional, default `""`).
- **`status`**: Enum `["open", "in_progress", "completed", "cancelled"]` (default `"open"`).
- **`priority`**: Enum `["low", "medium", "high", "urgent"]` (default `"medium"`).
- **`created_at`**: ISO-8601 UTC timestamp.
- **`updated_at`**: ISO-8601 UTC timestamp.

---

## Unified REST API Endpoints

Both APIs expose identical endpoints and status codes:

| Method | Endpoint | Description | Status Code |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Service health status | `200 OK` |
| `GET` | `/tasks` | List all tasks (supports `?status=...&priority=...&search=...`) | `200 OK` |
| `GET` | `/tasks/:id` | Fetch task by ID | `200 OK` / `404 Not Found` |
| `POST` | `/tasks` | Create a new task (validated payload) | `201 Created` / `422 Unprocessable` |
| `PATCH`| `/tasks/:id` | Partially update a task | `200 OK` / `404 Not Found` / `422` |
| `DELETE`| `/tasks/:id` | Delete a task | `200 OK` / `404 Not Found` |

---

## Error Handling & Normalization

Both services format error responses into a predictable JSON structure:

### 1. Validation Error (`422 Unprocessable Entity`)
```json
{
  "error": "Validation Error",
  "details": [
    {
      "field": "title",
      "message": "Title must not be empty"
    }
  ]
}
```

### 2. Not Found Error (`404 Not Found`)
```json
{
  "error": "Not Found",
  "message": "Task with ID 'task-999' not found"
}
```

### 3. Malformed JSON Body (`400 Bad Request`)
```json
{
  "error": "Bad Request",
  "message": "Invalid JSON payload"
}
```

---

## How to Run

### Option A: Express API (Node.js)

```bash
cd backend-poc/express-api
npm install
npm start
```
- Server starts at: **`http://localhost:3000`**
- Health check: `curl http://localhost:3000/health`

### Option B: FastAPI (Python)

```bash
cd backend-poc/fastapi-api
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
python main.py
```
- Server starts at: **`http://localhost:8000`**
- Interactive Swagger docs: **`http://localhost:8000/docs`**
- Health check: `curl http://localhost:8000/health`

---

## Side-by-Side Curl Examples

### 1. List Tasks with Filters
```bash
# Express
curl "http://localhost:3000/tasks?status=in_progress&priority=high"

# FastAPI
curl "http://localhost:8000/tasks?status=in_progress&priority=high"
```

### 2. Create Task (Valid)
```bash
# Express
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy to staging", "priority": "urgent"}'

# FastAPI
curl -X POST http://localhost:8000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy to staging", "priority": "urgent"}'
```

### 3. Validation Failure (Empty Title)
```bash
# Express
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "   "}'

# FastAPI
curl -i -X POST http://localhost:8000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "   "}'
```
Both return `HTTP 422` with structured error details!

### 4. Delete Task
```bash
# Express
curl -X DELETE http://localhost:3000/tasks/task-1

# FastAPI
curl -X DELETE http://localhost:8000/tasks/task-1
```
