from datetime import datetime, timezone
from enum import Enum
import os
from typing import List, Optional
import uuid

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
import uvicorn

app = FastAPI(
    title="Task Tracker API",
    description="Task/Ticket Tracker REST API implemented with Python and FastAPI",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TaskStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, description="Title of the task")
    description: str = Field(default="", description="Detailed description")
    status: TaskStatus = Field(default=TaskStatus.open, description="Current status")
    priority: TaskPriority = Field(default=TaskPriority.medium, description="Priority level")

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Title must not be empty")
        return trimmed


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Title must not be empty")
            return trimmed
        return v


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    created_at: str
    updated_at: str


tasks_db: List[dict] = [
    {
        "id": "task-1",
        "title": "Set up CI/CD pipeline",
        "description": "Configure GitHub Actions for automated testing and linting",
        "status": TaskStatus.in_progress,
        "priority": TaskPriority.high,
        "created_at": "2026-11-20T08:00:00.000Z",
        "updated_at": "2026-11-20T08:00:00.000Z"
    },
    {
        "id": "task-2",
        "title": "Implement schema validation",
        "description": "Add Pydantic and Zod validation schemas for request bodies",
        "status": TaskStatus.completed,
        "priority": TaskPriority.medium,
        "created_at": "2026-11-20T08:30:00.000Z",
        "updated_at": "2026-11-20T09:00:00.000Z"
    },
    {
        "id": "task-3",
        "title": "Draft API documentation",
        "description": "Compare Express and FastAPI side-by-side with curl examples",
        "status": TaskStatus.open,
        "priority": TaskPriority.urgent,
        "created_at": "2026-11-20T09:15:00.000Z",
        "updated_at": "2026-11-20T09:15:00.000Z"
    }
]


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Formats validation errors to match Express API error response format exactly."""
    details = []
    for error in exc.errors():
        # Strip 'body' from loc path if present
        loc_parts = [str(x) for x in error.get("loc", []) if x != "body"]
        field_name = ".".join(loc_parts) or "body"
        msg = error.get("msg", "Invalid value")
        # Clean up pydantic prefix if present
        if msg.startswith("Value error, "):
            msg = msg.replace("Value error, ", "")
        details.append({
            "field": field_name,
            "message": msg
        })
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation Error",
            "details": details
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Normalizes HTTP errors into standard JSON format."""
    status_map = {
        400: "Bad Request",
        404: "Not Found",
        409: "Conflict",
        422: "Validation Error",
        500: "Internal Server Error"
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": status_map.get(exc.status_code, "Error"),
            "message": exc.detail
        }
    )


# Health check endpoint
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "service": "fastapi-task-api",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    }


# Root endpoint
@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Welcome to the Task Tracker API (FastAPI)",
        "docs": "/docs",
        "health": "/health"
    }


# GET /tasks
@app.get("/tasks", response_model=List[TaskResponse], tags=["Tasks"])
def get_tasks(
    status: Optional[TaskStatus] = Query(None, description="Filter by status"),
    priority: Optional[TaskPriority] = Query(None, description="Filter by priority"),
    search: Optional[str] = Query(None, description="Search term for title or description")
):
    """Retrieve tasks with optional filtering."""
    results = tasks_db

    if status is not None:
        results = [t for t in results if t["status"] == status]

    if priority is not None:
        results = [t for t in results if t["priority"] == priority]

    if search is not None:
        term = search.lower()
        results = [
            t for t in results
            if term in t["title"].lower() or term in t["description"].lower()
        ]

    return results


# GET /tasks/{id}
@app.get("/tasks/{task_id}", response_model=TaskResponse, tags=["Tasks"])
def get_task(task_id: str):
    """Retrieve a single task by ID."""
    task = next((t for t in tasks_db if t["id"] == task_id), None)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found"
        )
    return task


# POST /tasks
@app.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED, tags=["Tasks"])
def create_task(payload: TaskCreate):
    """Create a new task with validated body."""
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    new_task = {
        "id": f"task-{uuid.uuid4().hex[:8]}",
        "title": payload.title,
        "description": payload.description,
        "status": payload.status,
        "priority": payload.priority,
        "created_at": now,
        "updated_at": now
    }
    tasks_db.append(new_task)
    return new_task


# PATCH /tasks/{id}
@app.patch("/tasks/{task_id}", response_model=TaskResponse, tags=["Tasks"])
def update_task(task_id: str, payload: TaskUpdate):
    """Partially update an existing task."""
    task = next((t for t in tasks_db if t["id"] == task_id), None)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found"
        )

    # Check that at least one field is provided
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update"
        )

    for key, value in update_data.items():
        task[key] = value

    task["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return task


# DELETE /tasks/{id}
@app.delete("/tasks/{task_id}", tags=["Tasks"])
def delete_task(task_id: str):
    """Delete a task by ID."""
    index = next((i for i, t in enumerate(tasks_db) if t["id"] == task_id), None)
    if index is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found"
        )

    tasks_db.pop(index)
    return {"message": f"Task '{task_id}' deleted successfully"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
